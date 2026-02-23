# Backend (FastAPI)

This backend is organized as a modular FastAPI application with feature-based routing and shared schemas/dependencies.

## Folder structure

```text
backend/
  app/
    main.py                 # FastAPI app factory and router registration
    core/
      config.py             # app settings
      policy_enforcer.py    # deterministic NDA policy checks
    api/
      routes/
        health.py           # /api/health and /api/attestation
        ingest.py           # /api/ingest
        chat.py             # /api/chat + stream + wallet history
        deals.py            # /api/deal/* and /api/deals
    services/
      rag_service.py
      tee_service.py
      deal_service.py
      blockchain_service.py
    repositories/
      chat_repository.py
    evaluation/
      evaluate_claims.py
  db/
    supabase_schema.sql
    deps.py                 # shared helpers (session chain + response signing)
    schemas.py              # request/response models
  requirements.txt
  .env.example
  Dockerfile
```

## Run locally

```bash
python -m venv venv
# Windows PowerShell
source venv/bin/activate
```

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Why this structure

- Separates route handlers by domain (`chat`, `deals`, `ingest`, `health`).
- Keeps API contracts in one place (`app/schemas.py`).
- Moves shared route logic out of handlers (`app/deps.py`).
- Keeps business logic and integrations isolated in `app/services/` and `app/repositories/`.
- Supports deal-room shared sessions (`deal_room_id`) for realtime chat synchronization.

## Next recommended improvements

- Split `app/schemas.py` into per-domain schema modules once model count grows.
- Add API tests under `tests/` for each router module.

## Deploying to a Real TEE (dstack by Phala Network)

Currently, the backend defaults to a simulated TEE environment for local development. To transition from the simulation to an actual Confidential Virtual Machine (CVM), you can use Phala Network's `dstack` orchestrator.

The application is already configured to detect the hardware TEE by looking for the `/var/run/dstack.sock` Unix socket. When deployed via `dstack`, this socket is automatically injected, and the backend will start fetching real cryptographic attestation quotes.

### 1. Install the Phala CLI

Install the Phala Cloud CLI globally using npm:

```bash
npm install -g phala
```

### 2. Prepare the Docker Compose Configuration

The root of the `backend` directory contains a `docker-compose.yml` file structured for deployment:

```yaml
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      - SECURITY_PROFILE=high-value
      - PORT=8000
```

### 3. Deploy the Confidential Container

With the CLI installed and the compose file ready, you can deploy your application to a TEE instance:

```bash
# Login/authenticate with Phala Cloud (if required by your environment)
phala login

# Deploy the confidential application
phala deploy --compose docker-compose.yml
```

Once deployed, `app/services/tee_service.py` will automatically switch from simulated mode to hardware mode, reporting `"enclave_status": "ACTIVE"` and verifying signatures against the real TDX hardware quote.
