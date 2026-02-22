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

