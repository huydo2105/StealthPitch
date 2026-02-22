# StealthPitch

Secure invention disclosure using AI agents inside a Trusted Execution Environment (TEE), aligned to NDAI (arXiv:2502.07924v1).

## What Is Implemented Now

- Hard NDA policy enforcement with deterministic server-side blocking/sanitization.
- Conditional disclosure flow: reveal endpoint is locked until deal is accepted.
- Dual-agent negotiation with budget cap and threshold checks.
- Noisy-agent simulation with bounded outcomes and metric logs.
- Response-level attestation binding: signed payloads + verification metadata.
- Security profiles (`baseline` / `high-value`) with simulated multi-provider TEE mode.
- Evaluation harness for M1-M5 with markdown report output.
- Shared deal-room chat sessions with Supabase Realtime sync for founder/investor.

## Architecture

```text
Frontend (Next.js) <-> Backend (FastAPI)
                          |- RAG + Policy Gate
                          |- Deal Room + Escrow lifecycle
                          |- Attestation + response signing
                          |- Robustness metrics
                          |- Evaluation harness
                          |- ChromaDB
                          \- Etherlink NDAIEscrow (optional, via web3 bridge)
```

## NDAI Protocol Flow

1. Founder creates deal with acceptance threshold.
2. Investor joins with budget cap and escrow deposit.
3. AI agents negotiate under NDA policy gate.
4. Outcome is atomic:
   - **ACCEPT**: settlement occurs and reveal path unlocks.
   - **EXIT**: investor refunded and deal exits.
5. Signed response metadata is returned for verification.

## Project Structure

```text
backend/
  app/
    main.py
    core/policy_enforcer.py
    services/rag_service.py
    services/deal_service.py
    services/blockchain_service.py
    services/tee_service.py
    repositories/chat_repository.py
    evaluation/evaluate_claims.py
    db/supabase_schema.sql
contracts/
  NDAIEscrow.sol
frontend/src/
  app/chat/page.tsx
  app/deal/page.tsx
  app/attestation/page.tsx
  lib/api.ts
  lib/signature.ts
```

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
# Windows PowerShell
source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local
npm run dev
```

### Contracts (optional)

```bash
cd contracts
npm install
copy .env.example .env
npx hardhat compile
npx hardhat run scripts/deploy.js --network etherlinkTestnet
```

## Key API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | health + active deals |
| POST | `/api/chat` | policy-gated chat with signed response |
| POST | `/api/chat/stream` | streaming chat with final signed metadata |
| POST | `/api/chat` / `/api/chat/stream` + `deal_room_id` | shared room session title + realtime-friendly persistence |
| GET | `/api/attestation` | quote + health + security profile |
| POST | `/api/deal/{id}/negotiate` | dual-agent negotiation |
| POST | `/api/deal/{id}/accept` | accept deal |
| POST | `/api/deal/{id}/exit` | exit deal |
| POST | `/api/deal/{id}/reveal` | unrestricted reveal (accepted deals only) |

## Evaluation Harness

Run the claim checks (M1-M5):

```bash
cd backend
python app/evaluation/evaluate_claims.py
```

Generated report: `backend/evaluation_report.md`

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_API_KEY` | yes | Gemini API key |
| `ESCROW_CONTRACT_ADDRESS` | no | deployed escrow contract |
| `TEE_PRIVATE_KEY` | no | backend signer wallet |
| `ETHERLINK_RPC_URL` | no | RPC endpoint |
| `SIMULATE_AGENT_ERROR` | no | enable noisy-agent simulation (`true/false`) |
| `AGENT_ERROR_RANGE` | no | noise amplitude (float) |
| `SECURITY_PROFILE` | no | `baseline` or `high-value` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | backend URL |
| `NEXT_PUBLIC_SUPABASE_URL` | yes (for realtime) | Supabase project URL for browser subscriptions |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes (for realtime) | Supabase anon key used by frontend realtime client |
