from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from services.ocr_service import OcrServiceError, process_document
from schemas import ProcessDocumentRequest

app = FastAPI(title="Finance Controller OCR Service", version="1.0.0")

INTERNAL_TOKEN = os.getenv("OCR_SERVICE_INTERNAL_TOKEN", "")


@app.get("/health")
def health():
    return {"success": True, "message": "OCR service running"}


def _validate_internal_token(token: str | None) -> None:
    if INTERNAL_TOKEN and token != INTERNAL_TOKEN:
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
