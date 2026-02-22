"""Document ingestion routes."""

from __future__ import annotations

import os
import tempfile
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas import IngestResponse
from app.services import rag_service

router = APIRouter(tags=["ingest"])


@router.post("/api/ingest", response_model=IngestResponse)
async def ingest_files(files: List[UploadFile] = File(...)) -> IngestResponse:
    """Upload and ingest one or more files (PDF or TXT)."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    temp_paths: List[str] = []
    try:
        for upload in files:
            suffix = os.path.splitext(upload.filename or "doc.txt")[1]
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await upload.read()
            tmp.write(content)
            tmp.close()
            temp_paths.append(tmp.name)

        chunk_count = rag_service.ingest_documents(temp_paths)
        return IngestResponse(
            chunks_created=chunk_count,
            files_processed=len(files),
            message=f"Successfully ingested {len(files)} file(s) into {chunk_count} chunks.",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(exc)}")
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass

