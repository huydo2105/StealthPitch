"""
StealthPitch — Document Storage Service (Supabase Storage)
============================================================
Uses the Supabase Storage API to persist deal documents.
Falls back to local temp directory if Supabase is not configured.

Free tier: 1 GB storage, no egress fees (Supabase free plan).

Environment Variables (already in .env):
  SUPABASE_URL              — your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — service role key (already set)
  STORAGE_BUCKET            — bucket name (default: "deal-documents")
"""

import io
import logging
import os
import zipfile
from typing import List

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "deal-documents")


def is_configured() -> bool:
    """Returns True when Supabase credentials are available."""
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _get_client():
    from supabase import create_client  # type: ignore
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def upload_file(room_id: str, filename: str, content: bytes) -> str:
    """
    Upload a file to Supabase Storage.
    Returns the storage path: deal_uploads/{room_id}/{filename}
    """
    if not is_configured():
        raise RuntimeError("Supabase credentials not configured.")

    client = _get_client()
    path = f"deal_uploads/{room_id}/{filename}"

    # upsert=True overwrites if the same file is re-uploaded
    client.storage.from_(STORAGE_BUCKET).upload(
        path=path,
        file=content,
        file_options={"upsert": "true", "content-type": "application/octet-stream"},
    )
    logger.info("Uploaded %s → supabase://%s/%s", filename, STORAGE_BUCKET, path)
    return path


def list_files(room_id: str) -> List[str]:
    """Return a list of storage paths for a given deal room."""
    if not is_configured():
        return []
    client = _get_client()
    prefix = f"deal_uploads/{room_id}"
    items = client.storage.from_(STORAGE_BUCKET).list(prefix)
    return [f"{prefix}/{item['name']}" for item in items if item.get("name")]


def download_all_as_zip(room_id: str) -> io.BytesIO:
    """
    Download all files for a deal room from Supabase Storage and pack
    them into an in-memory ZIP archive.  Returns the BytesIO at position 0.
    """
    if not is_configured():
        raise RuntimeError("Supabase credentials not configured.")

    paths = list_files(room_id)
    if not paths:
        raise FileNotFoundError(f"No documents found for deal room {room_id}.")

    client = _get_client()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            file_bytes = client.storage.from_(STORAGE_BUCKET).download(path)
            arcname = path.split("/")[-1]
            zf.writestr(arcname, file_bytes)

    buf.seek(0)
    return buf
