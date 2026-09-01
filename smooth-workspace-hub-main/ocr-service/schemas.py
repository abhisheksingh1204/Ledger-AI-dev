from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ProcessDocumentRequest(BaseModel):
    documentId: str = Field(..., min_length=1)


class ErrorResponse(BaseModel):
    success: bool = False
    error: dict


class ProcessResponse(BaseModel):
    success: bool = True
    data: dict
