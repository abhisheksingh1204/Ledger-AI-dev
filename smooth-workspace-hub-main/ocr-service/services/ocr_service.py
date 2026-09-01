from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import requests
from PIL import Image
from io import BytesIO
from dotenv import load_dotenv

from extractors import extract_bank_statement_from_text, extract_invoice_from_text
from services.document_repository import get_document_by_id
from utils import normalize_whitespace

load_dotenv()

ALLOWED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg"}
OCR_PROVIDER = "ocr.space"
DEFAULT_OCR_URL = "https://api.ocr.space/parse/image"
LOGGER = logging.getLogger(__name__)


@dataclass
class OcrServiceError(Exception):
    code: str
    message: str
    status_code: int = 500
    provider: str | None = None
    ocr_exit_code: int | str | None = None
    details: Any = None

    def __str__(self) -> str:
        return self.message


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_max_file_size_bytes() -> int:
    return _get_env_int("OCR_MAX_FILE_SIZE_MB", 1) * 1024 * 1024


def _get_timeout_seconds() -> int:
    return _get_env_int("OCR_SPACE_TIMEOUT_SECONDS", 90)


def _validate_internal_document(document: dict[str, Any]) -> None:
    mime_type = (document.get("mime_type") or "").lower()
    if mime_type not in ALLOWED_MIME_TYPES:
        raise OcrServiceError(
            code="OCR_UNSUPPORTED_FILE",
            message="Only PDF, PNG and JPEG documents are supported.",
            status_code=400,
        )

    max_bytes = _get_max_file_size_bytes()
    file_size = int(document.get("file_size") or 0)
    if file_size and file_size > max_bytes:
        raise OcrServiceError(
            code="OCR_FILE_TOO_LARGE",
            message=f"OCR file size exceeds the configured limit of {max_bytes // (1024 * 1024)} MB.",
            status_code=400,
        )


def _download_cloudinary_document(document: dict[str, Any]) -> bytes:
    url = document.get("cloudinary_secure_url") or document.get("cloudinary_url")
    if not url:
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message="Cloudinary URL is missing for this document.",
            status_code=502,
        )

    try:
        response = requests.get(url, timeout=_get_timeout_seconds())
    except requests.RequestException as exc:
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message=f"Failed to download document from Cloudinary: {exc}",
            status_code=502,
        ) from exc

    if response.status_code != 200:
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message=f"Cloudinary download failed with HTTP {response.status_code}.",
            status_code=502,
        )

    file_bytes = response.content
    max_bytes = _get_max_file_size_bytes()
    if len(file_bytes) > max_bytes:
        raise OcrServiceError(
            code="OCR_FILE_TOO_LARGE",
            message=f"OCR file size exceeds the configured limit of {max_bytes // (1024 * 1024)} MB.",
            status_code=400,
        )

    return file_bytes


def _provider_message(value: Any) -> str | None:
    if isinstance(value, list):
        value = " ".join(str(item) for item in value if item)
    if value is None:
        return None
    return str(value).strip() or None


def _classify_ocr_space_error(status_code: int | None, response_json: dict[str, Any] | None, raw_text: str, *, engine: int | None = None) -> OcrServiceError:
    response_json = response_json or {}
    provider_message = _provider_message(response_json.get("ErrorMessage"))
    provider_details = _provider_message(response_json.get("ErrorDetails"))
    message = provider_message or provider_details or raw_text.strip() or "OCR.Space request failed."
    exit_code = response_json.get("OCRExitCode")
    combined = " ".join(
        str(part or "")
        for part in [
            raw_text,
            (response_json or {}).get("ErrorMessage"),
            (response_json or {}).get("ErrorDetails"),
        ]
    ).lower()

    if status_code == 429 or "rate limit" in combined or "too many requests" in combined:
        return OcrServiceError("OCR_RATE_LIMITED", message, 429, OCR_PROVIDER, exit_code, provider_details)

    if status_code in {401, 403} or "invalid api key" in combined or "apikey" in combined:
        return OcrServiceError("OCR_API_FAILED", message, 401, OCR_PROVIDER, exit_code, provider_details)

    if status_code == 413 or "file too large" in combined or "too large" in combined:
        return OcrServiceError("OCR_FILE_TOO_LARGE", message, 400, OCR_PROVIDER, exit_code, provider_details)

    if "timeout" in combined:
        return OcrServiceError("OCR_API_TIMEOUT", message, 504, OCR_PROVIDER, exit_code, provider_details)

    return OcrServiceError("OCR_PROVIDER_ERROR", message, 502, OCR_PROVIDER, exit_code, provider_details)


def _parse_ocr_space_response(response_json: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    parsed_results = response_json.get("ParsedResults")
    if not isinstance(parsed_results, list):
        raise OcrServiceError("OCR_MALFORMED_RESPONSE", "OCR.Space response is malformed.", 502)

    pages: list[dict[str, Any]] = []
    texts: list[str] = []

    for index, result in enumerate(parsed_results, start=1):
        if not isinstance(result, dict):
            continue

        parsed_text = (result.get("ParsedText") or "").strip()
        if parsed_text:
            texts.append(parsed_text)

        pages.append(
            {
                "page_number": index,
                "parsed_text": parsed_text,
                "file_parse_exit_code": result.get("FileParseExitCode"),
                "error_message": result.get("ErrorMessage"),
                "error_details": result.get("ErrorDetails"),
            }
        )

    raw_text = "\n\n".join(texts).strip()
    if not raw_text:
        raise OcrServiceError("OCR_EMPTY_RESULT", "OCR.Space returned no readable text.", 422)

    ocr_exit_code = response_json.get("OCRExitCode")
    is_errored = response_json.get("IsErroredOnProcessing")
    if is_errored or str(ocr_exit_code) in {"3", "4"}:
        raise _classify_ocr_space_error(None, response_json, raw_text)

    return raw_text, pages


def _prepare_image(file_bytes: bytes, mime_type: str) -> bytes:
    if not mime_type.startswith("image/"):
        return file_bytes
    try:
        with Image.open(BytesIO(file_bytes)) as image:
            width, height = image.size
            if min(width, height) >= 100:
                return file_bytes
            scale = max(100 / max(width, 1), 100 / max(height, 1))
            resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
            output = BytesIO()
            resized.save(output, format="PNG")
            return output.getvalue()
    except Exception:
        return file_bytes


def _call_ocr_space(file_bytes: bytes, filename: str, mime_type: str, *, engine: int = 2, document_id: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    api_key = os.getenv("OCR_SPACE_API_KEY")
    api_url = os.getenv("OCR_SPACE_API_URL", DEFAULT_OCR_URL)

    if not api_key:
        raise OcrServiceError(
            code="OCR_API_FAILED",
            message="OCR_SPACE_API_KEY is not configured.",
            status_code=500,
        )

    data = {
        "language": "eng",
        "isOverlayRequired": "false",
        "detectOrientation": "true",
        "scale": "true",
        "isTable": "true",
        "OCREngine": str(engine),
    }

    files = {
        "file": (filename, file_bytes, mime_type),
    }

    try:
        response = requests.post(
            api_url,
            headers={"apikey": api_key},
            data=data,
            files={"file": (filename, _prepare_image(file_bytes, mime_type), mime_type)},
            timeout=_get_timeout_seconds(),
        )
    except requests.Timeout as exc:
        raise OcrServiceError("OCR_API_TIMEOUT", "OCR.Space request timed out.", 504) from exc
    except requests.RequestException as exc:
        raise OcrServiceError("OCR_API_FAILED", f"OCR.Space request failed: {exc}", 502) from exc

    raw_body = response.text or ""
    try:
        response_json = response.json()
    except ValueError as exc:
        raise OcrServiceError("OCR_MALFORMED_RESPONSE", "OCR.Space returned invalid JSON.", 502) from exc

    if response.status_code != 200:
        error = _classify_ocr_space_error(response.status_code, response_json, raw_body, engine=engine)
        LOGGER.warning("OCR.Space failed documentId=%s engine=%s exitCode=%s errorMessage=%s errorDetails=%s", document_id, engine, error.ocr_exit_code, error.message, error.details)
        raise error

    if response_json.get("IsErroredOnProcessing"):
        error = _classify_ocr_space_error(response.status_code, response_json, raw_body, engine=engine)
        LOGGER.warning("OCR.Space failed documentId=%s engine=%s exitCode=%s errorMessage=%s errorDetails=%s", document_id, engine, error.ocr_exit_code, error.message, error.details)
        if engine == 2 and "engine 2" in error.message.lower() and "engine 1" in error.message.lower():
            return _call_ocr_space(file_bytes, filename, mime_type, engine=1, document_id=document_id)
        raise error

    return _parse_ocr_space_response(response_json)


def _build_extracted_payload(document: dict[str, Any], raw_text: str, pages: list[dict[str, Any]]) -> dict[str, Any]:
    cleaned_text = normalize_whitespace(raw_text)

    if document["document_type"] == "INVOICE":
        structured = extract_invoice_from_text(cleaned_text)
    else:
        structured = extract_bank_statement_from_text(cleaned_text, document["document_id"])

    structured["schema_version"] = "1.0"
    structured["ocr_provider"] = OCR_PROVIDER
    structured["ocr"] = {
        "raw_text": raw_text,
        "cleaned_text": cleaned_text,
    }
    structured["pages"] = pages
    structured.setdefault("warnings", [])
    return structured


def process_document(document_id: str) -> dict[str, Any]:
    document = get_document_by_id(document_id)
    _validate_internal_document(document)

    file_bytes = _download_cloudinary_document(document)
    raw_text, pages = _call_ocr_space(
        file_bytes=file_bytes,
        filename=document.get("original_filename") or f"{document_id}.bin",
        mime_type=document.get("mime_type") or "application/octet-stream",
        document_id=document_id,
    )

    return _build_extracted_payload(document, raw_text, pages)
