from __future__ import annotations

import os
from services.document_repository import get_connection

from fastapi import FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from services.document_repository import get_document_by_id
from services.ocr_service import (
    OcrServiceError,
    _build_extracted_payload,
    process_document,
    score_semantic_similarity,
    warm_service_models,
)
from schemas import ParseDocumentTextRequest, ProcessDocumentRequest, SemanticScoreRequest

app = FastAPI(title="Finance Controller OCR Service", version="1.0.0")

INTERNAL_TOKEN = os.getenv("OCR_SERVICE_INTERNAL_TOKEN", "")
ALLOW_INSECURE_INTERNAL_SERVICE = os.getenv("ALLOW_INSECURE_INTERNAL_SERVICE", "false").lower() == "true"


@app.on_event("startup")
def startup_event():
    warm_service_models()


@app.get("/health")
def health():
    database = "ready"
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
    except Exception:
        database = "unavailable"

    from services.ocr_service import _MODEL_READINESS

    paddleocr = "ready" if _MODEL_READINESS["paddleocr"] else "unavailable"
    e5 = "ready" if _MODEL_READINESS["e5"] else "unavailable"
    status = "ok" if database == "ready" and paddleocr == "ready" and e5 == "ready" else "degraded"
    return {
        "success": status == "ok",
        "status": status,
        "database": database,
        "paddleocr": paddleocr,
        "e5": e5,
    }


def _validate_internal_token(token: str | None) -> None:
    if not INTERNAL_TOKEN and not ALLOW_INSECURE_INTERNAL_SERVICE:
        raise HTTPException(
            status_code=401,
            detail={"code": "INTERNAL_TOKEN_NOT_CONFIGURED", "message": "Internal service token is not configured."},
        )
    if not ALLOW_INSECURE_INTERNAL_SERVICE and token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Invalid internal token."},
        )


@app.post("/internal/process-document")
def process_document_route(
    payload: ProcessDocumentRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    _validate_internal_token(x_internal_token)

    try:
        structured = process_document(payload.documentId)
        return {"success": True, "data": structured}
    except OcrServiceError as exc:
        detail = {
            "code": exc.code,
            "message": exc.message,
        }
        if exc.provider:
            detail.update({
                "provider": exc.provider,
                "ocrExitCode": exc.ocr_exit_code,
                "details": exc.details,
            })
        raise HTTPException(
            status_code=exc.status_code,
            detail=detail,
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": str(exc)},
        ) from exc


@app.post("/internal/parse-document-text")
def parse_document_text_route(
    payload: ParseDocumentTextRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    _validate_internal_token(x_internal_token)

    try:
        document = get_document_by_id(payload.documentId)
        return {
            "success": True,
            "data": _build_extracted_payload(
                document,
                payload.rawText,
                payload.pages,
                provider="gemini",
                fallback_used=True,
            ),
        }
    except LookupError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": str(exc)},
        ) from exc


@app.post("/internal/semantic-score")
def semantic_score_route(
    payload: SemanticScoreRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    _validate_internal_token(x_internal_token)

    try:
        return {
            "success": True,
            "data": score_semantic_similarity(payload.query, payload.passages),
        }
    except OcrServiceError as exc:
        detail = {"code": exc.code, "message": exc.message}
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc


@app.exception_handler(HTTPException)
def http_exception_handler(_, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": detail})


@app.exception_handler(RequestValidationError)
def validation_exception_handler(_, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    message = first_error.get("msg", "Validation failed.")
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": message}},
    )


@app.exception_handler(Exception)
def unhandled_exception_handler(_, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_SERVER_ERROR", "message": str(exc)}},
    )
