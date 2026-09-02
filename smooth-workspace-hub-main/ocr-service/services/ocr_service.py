from __future__ import annotations

import json
import logging
import os
import time
from io import BytesIO
from dataclasses import dataclass
from typing import Any
from functools import lru_cache

import requests
from PIL import Image
from dotenv import load_dotenv

from extractors import extract_bank_statement_from_text, extract_invoice_from_text
from services.document_repository import get_document_by_id
from utils import normalize_whitespace

load_dotenv()

ALLOWED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg"}
OCR_PROVIDER = "ocr.space"
DEFAULT_OCR_URL = "https://api.ocr.space/parse/image"
E5_MODEL_NAME = os.getenv("E5_MODEL_NAME", "intfloat/e5-small-v2")
PADDLE_DET_MODEL_NAME = os.getenv("PADDLE_DET_MODEL_NAME", "PP-OCRv5_mobile_det")
PADDLE_REC_MODEL_NAME = os.getenv("PADDLE_REC_MODEL_NAME", "en_PP-OCRv5_mobile_rec")
PDF_RENDER_DPI = int(os.getenv("PDF_RENDER_DPI", "150"))
PADDLE_CPU_THREADS = int(os.getenv("PADDLE_CPU_THREADS", "4"))
OCR_MAX_IMAGE_DIMENSION = int(os.getenv("OCR_MAX_IMAGE_DIMENSION", "2500"))
LOGGER = logging.getLogger(__name__)
_PADDLE_OCR_MODEL = None
_E5_MODEL = None
_MODEL_READINESS = {"paddleocr": False, "e5": False}


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


def warm_service_models() -> None:
    """Load OCR and embedding models once during service startup."""
    started_at = time.monotonic()
    try:
        _get_paddle_ocr()
        _warm_paddle_inference()
        _MODEL_READINESS["paddleocr"] = True
        LOGGER.info("PaddleOCR ready model_det=%s model_rec=%s init_ms=%s", PADDLE_DET_MODEL_NAME, PADDLE_REC_MODEL_NAME, round((time.monotonic() - started_at) * 1000))
    except Exception:
        LOGGER.exception("Failed to warm PaddleOCR model.")

    try:
        _load_e5_model()
        _MODEL_READINESS["e5"] = True
    except Exception:
        LOGGER.exception("Failed to warm E5 model.")


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _warm_paddle_inference() -> None:
    import numpy as np

    model = _PADDLE_OCR_MODEL
    if model is None:
        raise OcrServiceError("PADDLEOCR_UNAVAILABLE", "PaddleOCR model is not initialized.", 503)
    model.predict(np.full((96, 96, 3), 255, dtype=np.uint8))


def _get_max_file_size_bytes() -> int:
    return _get_env_int("MAX_DOCUMENT_SIZE_MB", 10) * 1024 * 1024


def _get_ocr_space_max_file_size_bytes() -> int:
    return _get_env_int("OCR_SPACE_MAX_FILE_SIZE_MB", 1) * 1024 * 1024


def _get_timeout_seconds() -> int:
    return _get_env_int("OCR_SPACE_TIMEOUT_SECONDS", 90)


def _get_paddle_ocr():
    global _PADDLE_OCR_MODEL
    if _PADDLE_OCR_MODEL is not None:
        return _PADDLE_OCR_MODEL

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:  # pragma: no cover - import failure is environment-specific
        raise OcrServiceError(
            code="PADDLEOCR_UNAVAILABLE",
            message=f"PaddleOCR is unavailable: {exc}",
            status_code=503,
        ) from exc

    try:
        import paddle
        paddle.set_device("cpu")
        paddle.set_num_threads(max(1, PADDLE_CPU_THREADS))
    except Exception:
        pass

    init_attempts = [
        {
            "device": "cpu",
            "enable_mkldnn": False,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "text_detection_model_name": PADDLE_DET_MODEL_NAME,
            "text_recognition_model_name": PADDLE_REC_MODEL_NAME,
        }
    ]

    last_error: Exception | None = None
    for kwargs in init_attempts:
        try:
            _PADDLE_OCR_MODEL = PaddleOCR(**kwargs)
            return _PADDLE_OCR_MODEL
        except TypeError as exc:
            last_error = exc
        except Exception as exc:
            last_error = exc

    raise OcrServiceError(
        code="PADDLEOCR_UNAVAILABLE",
        message=f"Unable to initialize PaddleOCR: {last_error}",
        status_code=503,
    ) from last_error


def _load_e5_model():
    global _E5_MODEL
    if _E5_MODEL is not None:
        return _E5_MODEL

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # pragma: no cover - import failure is environment-specific
        raise OcrServiceError(
            code="E5_MODEL_UNAVAILABLE",
            message=f"E5 model dependencies are unavailable: {exc}",
            status_code=503,
        ) from exc

    try:
        _E5_MODEL = SentenceTransformer(E5_MODEL_NAME)
        return _E5_MODEL
    except Exception as exc:
        raise OcrServiceError(
            code="E5_MODEL_LOAD_FAILED",
            message=f"Unable to load E5 model '{E5_MODEL_NAME}': {exc}",
            status_code=503,
        ) from exc


def _is_ocr_fallback_eligible(error: OcrServiceError) -> bool:
    return error.code in {
        "PADDLEOCR_UNAVAILABLE",
        "PADDLEOCR_PROVIDER_ERROR",
        "PADDLEOCR_EMPTY_RESULT",
        "OCR_PROVIDER_ERROR",
        "OCR_MALFORMED_RESPONSE",
        "OCR_EMPTY_RESULT",
        "OCR_API_TIMEOUT",
        "OCR_RATE_LIMITED",
        "OCR_PROVIDER_TIMEOUT",
        "OCR_TIMEOUT",
    }


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


def _render_document_pages(file_bytes: bytes, mime_type: str) -> list[tuple[int, bytes, str]]:
    mime_type = (mime_type or "").lower()
    if mime_type == "application/pdf":
        try:
            import fitz
        except Exception as exc:  # pragma: no cover - dependency import failure is environment-specific
            raise OcrServiceError(
                code="PADDLEOCR_PROVIDER_ERROR",
                message=f"PDF rendering is unavailable: {exc}",
                status_code=503,
            ) from exc

        pages: list[tuple[int, bytes, str]] = []
        document = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            for index, page in enumerate(document, start=1):
                scale = max(PDF_RENDER_DPI, 72) / 72
                pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                pages.append((index, pixmap.tobytes("png"), "image/png"))
        finally:
            document.close()

        return pages

    if mime_type.startswith("image/"):
        return [(1, file_bytes, mime_type)]

    return [(1, file_bytes, mime_type or "application/octet-stream")]


def _image_bytes_to_array(image_bytes: bytes):
    try:
        import numpy as np
    except Exception as exc:  # pragma: no cover - dependency import failure is environment-specific
        raise OcrServiceError(
            code="PADDLEOCR_PROVIDER_ERROR",
            message=f"NumPy is unavailable: {exc}",
            status_code=503,
        ) from exc

    with Image.open(BytesIO(image_bytes)) as image:
        image = image.convert("RGB")
        max_dimension = max(image.size)
        if max_dimension > OCR_MAX_IMAGE_DIMENSION:
            scale = OCR_MAX_IMAGE_DIMENSION / max_dimension
            image = image.resize(
                (round(image.width * scale), round(image.height * scale)),
                Image.Resampling.LANCZOS,
            )
        return np.array(image)


def _extract_paddle_lines(result: Any) -> list[str]:
    if not result:
        return []

    if isinstance(result, list) and result and hasattr(result[0], "get"):
        lines: list[str] = []
        for page_result in result:
            lines.extend(_extract_paddle_lines(page_result))
        return lines

    if hasattr(result, "get"):
        texts = result.get("rec_texts") or []
        polygons = result.get("rec_polys") or result.get("dt_polys") or []
        lines = []
        for index, text in enumerate(texts):
            value = str(text or "").strip()
            if not value:
                continue
            polygon = polygons[index] if index < len(polygons) else []
            try:
                top = min(float(point[1]) for point in polygon)
                left = min(float(point[0]) for point in polygon)
            except (TypeError, ValueError):
                top = 0.0
                left = 0.0
            lines.append((top, left, value))
        return [text for _, _, text in sorted(lines, key=lambda item: (item[0], item[1]))]

    page_candidates = result
    if isinstance(result, list) and len(result) == 1 and isinstance(result[0], list):
        page_candidates = result[0]

    lines: list[tuple[float, float, str]] = []
    for item in page_candidates or []:
        if not item or not isinstance(item, (list, tuple)) or len(item) < 2:
            continue

        box = item[0]
        payload = item[1]

        text = ""
        if isinstance(payload, (list, tuple)) and payload:
            text = str(payload[0] or "").strip()
        elif isinstance(payload, dict):
            text = str(payload.get("text") or "").strip()
        elif isinstance(payload, str):
            text = payload.strip()

        if not text:
            continue

        top = 0.0
        left = 0.0
        if isinstance(box, (list, tuple)) and box:
            try:
                top = min(float(point[1]) for point in box if isinstance(point, (list, tuple)) and len(point) >= 2)
                left = min(float(point[0]) for point in box if isinstance(point, (list, tuple)) and len(point) >= 2)
            except Exception:
                top = 0.0
                left = 0.0

        lines.append((top, left, text))

    lines.sort(key=lambda item: (item[0], item[1]))
    return [text for _, _, text in lines]


def _call_paddle_ocr(file_bytes: bytes, filename: str, mime_type: str, *, document_id: str | None = None) -> tuple[str, list[dict[str, Any]]]:
    model = _get_paddle_ocr()
    started_at = time.monotonic()
    render_started_at = time.monotonic()
    pages = _render_document_pages(file_bytes, mime_type)
    render_ms = round((time.monotonic() - render_started_at) * 1000)
    inference_started_at = time.monotonic()
    texts: list[str] = []
    normalized_pages: list[dict[str, Any]] = []

    for page_number, page_bytes, _page_mime in pages:
        try:
            image_array = _image_bytes_to_array(page_bytes)
            result = model.predict(image_array)
        except OcrServiceError:
            raise
        except Exception as exc:
            LOGGER.warning("PaddleOCR failed documentId=%s page=%s filename=%s error=%s", document_id, page_number, filename, exc)
            raise OcrServiceError(
                code="PADDLEOCR_PROVIDER_ERROR",
                message="PaddleOCR failed to process the document.",
                status_code=502,
                provider="paddleocr",
                details=str(exc),
            ) from exc

        page_text = "\n".join(_extract_paddle_lines(result)).strip()
        normalized_pages.append(
            {
                "page_number": page_number,
                "parsed_text": page_text,
            }
        )
        if page_text:
            texts.append(page_text)

    raw_text = "\n\n".join(texts).strip()
    inference_ms = round((time.monotonic() - inference_started_at) * 1000)
    if not raw_text:
        raise OcrServiceError(
            code="PADDLEOCR_EMPTY_RESULT",
            message="PaddleOCR returned no readable text.",
            status_code=422,
            provider="paddleocr",
        )

    LOGGER.info(
        "PaddleOCR timing document=%s pages=%s processed_pages=%s pdf_render_ms=%s paddle_inference_ms=%s total_ms=%s",
        document_id or "unknown",
        len(pages),
        len(normalized_pages),
        render_ms,
        inference_ms,
        round((time.monotonic() - started_at) * 1000),
    )
    return raw_text, normalized_pages


def _download_cloudinary_document(document: dict[str, Any], signed_url: str | None = None) -> bytes:
    url = signed_url
    if not url:
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message="Signed Cloudinary download URL is missing for this document.",
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

    if response.status_code in {401, 403}:
        LOGGER.warning("Cloudinary download failed documentId=%s status=%s", document.get("document_id"), response.status_code)
        raise OcrServiceError(
            code="CLOUDINARY_AUTH_ERROR",
            message="Unable to access private document.",
            status_code=response.status_code,
        )
    if response.status_code == 404:
        LOGGER.warning("Cloudinary download failed documentId=%s status=404", document.get("document_id"))
        raise OcrServiceError(
            code="CLOUDINARY_ASSET_NOT_FOUND",
            message="The stored Cloudinary asset could not be found.",
            status_code=404,
        )
    if response.status_code != 200:
        LOGGER.warning("Cloudinary download failed documentId=%s status=%s", document.get("document_id"), response.status_code)
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message=f"Cloudinary download failed with HTTP {response.status_code}.",
            status_code=502,
        )

    content_type = (response.headers.get("content-type") or "").split(";", 1)[0].lower()
    expected_mime_type = (document.get("mime_type") or "").lower()
    if expected_mime_type and content_type and content_type != expected_mime_type:
        LOGGER.warning(
            "Cloudinary download returned unexpected type documentId=%s content_type=%s",
            document.get("document_id"),
            content_type,
        )
        raise OcrServiceError(
            code="CLOUDINARY_DOWNLOAD_FAILED",
            message="Cloudinary returned an unexpected document type.",
            status_code=502,
        )

    content_length = int(response.headers.get("content-length") or 0)
    max_bytes = _get_max_file_size_bytes()
    if content_length > max_bytes:
        raise OcrServiceError(
            code="OCR_FILE_TOO_LARGE",
            message=f"OCR file size exceeds the configured limit of {max_bytes // (1024 * 1024)} MB.",
            status_code=400,
        )

    file_bytes = response.content
    if len(file_bytes) > max_bytes:
        raise OcrServiceError(
            code="OCR_FILE_TOO_LARGE",
            message=f"OCR file size exceeds the configured limit of {max_bytes // (1024 * 1024)} MB.",
            status_code=400,
        )

    LOGGER.info("Cloudinary download completed documentId=%s status=200", document.get("document_id"))
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

    if len(file_bytes) > _get_ocr_space_max_file_size_bytes():
        raise OcrServiceError(
            code="OCR_SPACE_FILE_TOO_LARGE",
            message="Document exceeds the OCR.Space-specific file-size limit.",
            status_code=413,
            provider=OCR_PROVIDER,
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

    started_at = time.monotonic()
    LOGGER.info("OCR.Space started document=%s", document_id or "unknown")
    try:
        response = requests.post(
            api_url,
            headers={"apikey": api_key},
            data=data,
            files={"file": (filename, _prepare_image(file_bytes, mime_type), mime_type)},
            timeout=_get_timeout_seconds(),
        )
    except requests.Timeout as exc:
        LOGGER.warning("OCR.Space failed document=%s reason=OCR_SPACE_TIMEOUT duration_ms=%s", document_id or "unknown", round((time.monotonic() - started_at) * 1000))
        raise OcrServiceError("OCR_API_TIMEOUT", "OCR.Space request timed out.", 504) from exc
    except requests.RequestException as exc:
        LOGGER.warning("OCR.Space failed document=%s reason=OCR_SPACE_NETWORK_ERROR duration_ms=%s", document_id or "unknown", round((time.monotonic() - started_at) * 1000))
        raise OcrServiceError("OCR_API_FAILED", f"OCR.Space request failed: {exc}", 502) from exc

    raw_body = response.text or ""
    try:
        response_json = response.json()
    except ValueError as exc:
        LOGGER.warning("OCR.Space failed document=%s reason=OCR_SPACE_MALFORMED_RESPONSE duration_ms=%s", document_id or "unknown", round((time.monotonic() - started_at) * 1000))
        raise OcrServiceError("OCR_MALFORMED_RESPONSE", "OCR.Space returned invalid JSON.", 502) from exc

    if response.status_code != 200:
        error = _classify_ocr_space_error(response.status_code, response_json, raw_body, engine=engine)
        LOGGER.warning("OCR.Space failed document=%s reason=%s status=%s duration_ms=%s", document_id or "unknown", error.code, response.status_code, round((time.monotonic() - started_at) * 1000))
        raise error

    if response_json.get("IsErroredOnProcessing"):
        error = _classify_ocr_space_error(response.status_code, response_json, raw_body, engine=engine)
        LOGGER.warning("OCR.Space failed document=%s reason=%s status=%s duration_ms=%s", document_id or "unknown", error.code, response.status_code, round((time.monotonic() - started_at) * 1000))
        if engine == 2 and "engine 2" in error.message.lower() and "engine 1" in error.message.lower():
            return _call_ocr_space(file_bytes, filename, mime_type, engine=1, document_id=document_id)
        raise error

    result = _parse_ocr_space_response(response_json)
    LOGGER.info("OCR.Space completed document=%s status=%s duration_ms=%s", document_id or "unknown", response.status_code, round((time.monotonic() - started_at) * 1000))
    return result


def _build_extracted_payload(
    document: dict[str, Any],
    raw_text: str,
    pages: list[dict[str, Any]],
    *,
    provider: str,
    fallback_used: bool,
    model: str | None = None,
) -> dict[str, Any]:
    cleaned_text = normalize_whitespace(raw_text)

    if document["document_type"] == "INVOICE":
        structured = extract_invoice_from_text(cleaned_text)
    else:
        structured = extract_bank_statement_from_text(cleaned_text, document["document_id"])

    structured["schema_version"] = "1.0"
    structured["ocr_provider"] = provider
    structured["ocr"] = {
        "provider": provider,
        "fallback_used": fallback_used,
        "raw_text": raw_text,
        "cleaned_text": cleaned_text,
        "pages": pages,
    }
    if model:
        structured["ocr"]["model"] = model
    structured["pages"] = pages
    structured.setdefault("warnings", [])
    return structured


def _prefix_semantic_text(prefix: str, value: str) -> str:
    text = normalize_whitespace(value)
    return f"{prefix}: {text}" if text else ""


def score_semantic_similarity(query: str, passages: list[str]) -> dict[str, Any]:
    model = _load_e5_model()
    semantic_query = _prefix_semantic_text("query", query)
    semantic_passages = [_prefix_semantic_text("passage", passage) for passage in passages]

    if not semantic_query or not all(semantic_passages):
        raise OcrServiceError(
            code="SEMANTIC_SCORE_INVALID",
            message="Query and passages are required for semantic scoring.",
            status_code=400,
        )

    try:
        embeddings = model.encode(
            [semantic_query, *semantic_passages],
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
    except Exception as exc:
        raise OcrServiceError(
            code="SEMANTIC_SCORE_FAILED",
            message=f"Unable to compute semantic similarity: {exc}",
            status_code=502,
        ) from exc

    scores: list[dict[str, Any]] = []
    query_vector = embeddings[0]

    for passage, passage_vector in zip(passages, embeddings[1:]):
        cosine_similarity = float(max(0.0, min(1.0, float(query_vector @ passage_vector))))
        semantic_score = round(cosine_similarity * 100, 2)
        scores.append(
            {
                "passage": passage,
                "cosine_similarity": round(cosine_similarity, 6),
                "semantic_score": semantic_score,
            }
        )

    return {
        "provider": "e5-small-v2",
        "model": E5_MODEL_NAME,
        "query": query,
        "scores": scores,
    }


def process_document(document_id: str, signed_download_url: str) -> dict[str, Any]:
    started_at = time.monotonic()
    document = get_document_by_id(document_id)
    _validate_internal_document(document)

    file_bytes = _download_cloudinary_document(document, signed_download_url)
    filename = document.get("original_filename") or f"{document_id}.bin"
    mime_type = document.get("mime_type") or "application/octet-stream"

    try:
        raw_text, pages = _call_paddle_ocr(
            file_bytes=file_bytes,
            filename=filename,
            mime_type=mime_type,
            document_id=document_id,
        )
        provider = "paddleocr"
        fallback_used = False
        LOGGER.info("PaddleOCR succeeded documentId=%s", document_id)
    except OcrServiceError as primary_error:
        if not _is_ocr_fallback_eligible(primary_error):
            raise

        LOGGER.warning(
            "PaddleOCR failed documentId=%s reason=%s falling back to OCR.Space",
            document_id,
            primary_error.code,
        )
        raw_text = None
        pages = None
        try:
            raw_text, pages = _call_ocr_space(
                file_bytes=file_bytes,
                filename=filename,
                mime_type=mime_type,
                document_id=document_id,
            )
            provider = "ocr.space"
            fallback_used = True
            LOGGER.info("OCR.Space succeeded documentId=%s", document_id)
        except OcrServiceError as fallback_error:
            if fallback_error.code in {"OCR_API_FAILED", "OCR_RATE_LIMITED"}:
                raise fallback_error

            LOGGER.warning(
                "OCR.Space failed documentId=%s reason=%s",
                document_id,
                fallback_error.code,
            )
            raise OcrServiceError(
                code="OCR_ALL_PROVIDERS_FAILED",
                message="All OCR providers failed to extract this document.",
                status_code=502,
                details={
                    "providers": [
                        {
                            "provider": "paddleocr",
                            "reason": primary_error.code,
                        },
                        {
                            "provider": "ocr.space",
                            "reason": fallback_error.code,
                        },
                    ]
                },
            ) from fallback_error

    payload = _build_extracted_payload(
        document,
        raw_text,
        pages,
        provider=provider,
        fallback_used=fallback_used,
    )
    payload["ocr"]["processing_time_ms"] = round((time.monotonic() - started_at) * 1000)
    payload["ocr"]["pages_processed"] = len(pages or [])
    return payload
