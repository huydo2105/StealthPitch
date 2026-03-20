# ── StealthPitch Backend ─────────────────────────────────────────────
# FastAPI + RAG Engine running in Phala dstack TEE
# ─────────────────────────────────────────────────────────────────────

FROM python:3.10-slim

LABEL maintainer="StealthPitch Team"
LABEL description="StealthPitch FastAPI Backend — TEE AI Agent"

# System dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        sqlite3 \
        libsqlite3-dev \
        curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Persistent ChromaDB storage
RUN mkdir -p /app/chroma_db

# Layer-cached dependency install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
