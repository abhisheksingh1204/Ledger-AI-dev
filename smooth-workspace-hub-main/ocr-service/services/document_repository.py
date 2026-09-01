from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()


def _build_dsn() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    host = os.getenv("DB_HOST", "127.0.0.1")
    port = os.getenv("DB_PORT", "5432")
    database = os.getenv("DB_NAME", "Finance")
    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "postgres")
    return f"host={host} port={port} dbname={database} user={user} password={password}"


@contextmanager
def get_connection() -> Iterator[psycopg.Connection[Any]]:
    conn = psycopg.connect(_build_dsn(), row_factory=dict_row)
    try:
      yield conn
    finally:
      conn.close()


def get_document_by_id(document_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    document_id,
                    session_id,
                    user_id,
                    document_type,
                    original_filename,
                    mime_type,
                    file_size,
                    cloudinary_public_id,
                    cloudinary_url,
                    cloudinary_secure_url,
                    cloudinary_resource_type,
                    cloudinary_format,
                    processing_status,
                    extracted_data
                FROM documents
                WHERE document_id = %s
                LIMIT 1
                """,
                (document_id,),
            )
            row = cur.fetchone()

    if not row:
        raise LookupError("Document not found.")

    return dict(row)
