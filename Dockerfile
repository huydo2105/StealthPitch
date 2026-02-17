# ── StealthPitch ─────────────────────────────────────────────────────
# TEE-based AI Due-Diligence Agent  |  Phala Network dstack CVM
# Base: python:3.10-slim
# ─────────────────────────────────────────────────────────────────────

FROM python:3.10-slim

# Metadata
LABEL maintainer="StealthPitch Team"
LABEL description="Confidential AI Due-Diligence Agent running in a Phala dstack TEE"

# System dependencies (build tools + sqlite3 headers for pysqlite3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        sqlite3 \
        libsqlite3-dev \
        curl && \
    rm -rf /var/lib/apt/lists/*

# Working directory
WORKDIR /app

# Persistent ChromaDB storage directory
RUN mkdir -p /app/chroma_db

# ── Layer-cached dependency install ──────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ────────────────────────────────────────────────
COPY . .

# Streamlit configuration (disable telemetry, CORS for dstack)
RUN mkdir -p /root/.streamlit && \
    echo '[server]\n\
headless = true\n\
enableCORS = false\n\
enableXsrfProtection = false\n\
port = 8501\n\
address = "0.0.0.0"\n\
\n\
[browser]\n\
gatherUsageStats = false\n' > /root/.streamlit/config.toml

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8501/_stcore/health || exit 1

ENTRYPOINT ["streamlit", "run", "app.py", \
    "--server.port=8501", \
    "--server.address=0.0.0.0"]
