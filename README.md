# 🔐 StealthPitch

**Confidential AI Due-Diligence Agent** powered by Trusted Execution Environments (TEE).

StealthPitch lets founders share proprietary documents inside a hardware-encrypted enclave. Investors can query the AI agent under NDA constraints — raw IP is never disclosed.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Phala dstack TEE                       │
│                                                          │
│  ┌─────────────┐    REST/SSE      ┌──────────────────┐  │
│  │  Next.js    │ ──────────────▶  │  FastAPI Backend │  │
│  │  Frontend   │                  │  (RAG + TEE Sim) │  │
│  │  :3000      │ ◀──────────────  │  :8000           │  │
│  └─────────────┘                  └──────────────────┘  │
│                                           │              │
│                                    ┌──────┴──────┐       │
│                                    │  ChromaDB   │       │
│                                    │  (vectors)  │       │
│                                    └─────────────┘       │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, TailwindCSS v4, Framer Motion |
| **Backend** | FastAPI, Uvicorn, LangChain |
| **AI Model** | Google Gemini 2.5 Flash |
| **Embeddings** | Gemini Embedding 001 |
| **Vector Store** | ChromaDB |
| **TEE** | Phala Network dstack (Intel TDX) |

## Project Structure

```
IC3-Hackathon/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── rag_engine.py        # LangChain RAG pipeline
│   ├── tee_simulator.py     # Intel TDX attestation simulator
│   ├── requirements.txt     # Python dependencies
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js pages (vault, chat, attestation)
│   │   ├── components/      # React components (Sidebar, etc.)
│   │   └── lib/             # API client helpers
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml       # Multi-service deployment
└── .env                     # GOOGLE_API_KEY
```

## Quick Start

### Prerequisites
- **Node.js** ≥ 20 (`nvm use 20`)
- **Python** ≥ 3.10
- **Google API Key** (`GOOGLE_API_KEY`)

### 1. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your GOOGLE_API_KEY
uvicorn main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### Docker (Production)
```bash
# Set GOOGLE_API_KEY in .env at project root
docker compose up --build
# Frontend → http://localhost:80
# Backend  → http://localhost:8000
```

## Pages

| Page | Route | Description |
|---|---|---|
| **Founder Vault** | `/vault` | Encrypted file upload + RAG ingestion |
| **Investor Chat** | `/chat` | NDA-governed Q&A with AI agent |
| **Attestation** | `/attestation` | TDX quote + TEE health dashboard |

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Service status + document availability |
| `/api/ingest` | POST | Upload files for RAG ingestion |
| `/api/chat` | POST | Query the AI agent |
| `/api/chat/stream` | POST | Streaming chat (SSE) |
| `/api/attestation` | GET | TDX attestation quote + TEE health |

## Environment Variables

| Variable | Location | Description |
|---|---|---|
| `GOOGLE_API_KEY` | `backend/.env` | Google Gemini API key (required) |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Backend URL (default: `http://localhost:8000`) |

## License

Private — IC3 Hackathon 2026
