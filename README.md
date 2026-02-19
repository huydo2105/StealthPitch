# StealthPitch 🛡️

**Secure invention disclosure using AI agents inside a Trusted Execution
Environment — an "ironclad NDA" powered by cryptography and smart contracts.**

> Based on [NDAI Agreements (arXiv:2502.07924v1)](https://arxiv.org/abs/2502.07924v1)
> — solving Arrow's Disclosure Paradox with TEEs.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Phala dstack TEE (CVM)                       │
│                                                              │
│  ┌────────────┐  REST/SSE  ┌───────────────────────────┐    │
│  │  Next.js   │ ─────────▶ │  FastAPI Backend           │    │
│  │  Frontend  │            │  ├─ RAG Engine (Gemini)    │    │
│  │  :3000     │ ◀───────── │  ├─ Deal Room Manager     │    │
│  │            │            │  ├─ Blockchain Bridge      │    │
│  └────────────┘            │  └─ TEE Attestation        │    │
│                            └──────────┬─────────────────┘    │
│                                       │                      │
│                                ┌──────┴──────┐               │
│                                │  ChromaDB   │               │
│                                └─────────────┘               │
└───────────────────────────────────┬──────────────────────────┘
                                    │ web3 RPC
                              ┌─────┴────────────┐
                              │  Etherlink        │
                              │  Testnet (128123) │
                              │  NDAIEscrow.sol   │
                              └──────────────────┘
```

## NDAI Deal Protocol

| Step | Action | Where |
|------|--------|-------|
| 1 | Founder creates deal room with **acceptance threshold** | Backend + Etherlink |
| 2 | Founder uploads proprietary documents | TEE enclave |
| 3 | Investor joins with **budget cap** + deposits to escrow | Etherlink smart contract |
| 4 | AI agents negotiate inside TEE (dual-agent RAG) | TEE enclave |
| 5a | **ACCEPT** → funds released to founder, docs accessible | Smart contract |
| 5b | **EXIT** → full refund, all data deleted — nothing leaked | Smart contract + TEE |

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, TailwindCSS, Framer Motion |
| **Backend** | FastAPI, LangChain, Google Gemini 2.5 Flash |
| **Vector DB** | ChromaDB |
| **TEE** | Phala Network dstack (Intel TDX) |
| **Blockchain** | Etherlink Testnet, Solidity, Hardhat, web3.py |
| **Smart Contract** | NDAIEscrow.sol (escrow with TEE-authorized settlement) |

## Project Structure

```
IC3-Hackathon/
├── backend/
│   ├── main.py              # FastAPI app + deal room endpoints
│   ├── rag_engine.py         # RAG pipeline + dual-agent negotiation
│   ├── deal_room.py          # Deal lifecycle manager
│   ├── blockchain.py         # Web3.py bridge to Etherlink
│   ├── tee_manager.py        # Intel TDX attestation
│   └── requirements.txt
├── contracts/
│   ├── NDAIEscrow.sol        # Escrow smart contract
│   ├── hardhat.config.js     # Etherlink Testnet config
│   ├── scripts/deploy.js     # Deployment script
│   └── package.json
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx       # Landing page (NDAI explainer)
│       │   ├── deal/page.tsx  # Deal room (create/join)
│       │   ├── chat/page.tsx  # Negotiation chat (dual-agent)
│       │   ├── vault/page.tsx # Document upload
│       │   └── attestation/page.tsx  # TEE dashboard
│       ├── components/
│       │   └── Sidebar.tsx
│       └── lib/
│           └── api.ts         # Typed API client
├── docker-compose.yml
├── README.md
└── ROADMAP.md
```

## Quick Start

### Prerequisites
- Python 3.11+ with venv
- Node.js 18+
- Google API key for Gemini

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
echo "GOOGLE_API_KEY=your_key" > .env
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

### Smart Contract (Optional — for blockchain integration)
```bash
cd contracts
npm install
cp .env.example .env  # Fill in DEPLOYER_PRIVATE_KEY
npx hardhat compile
npx hardhat run scripts/deploy.js --network etherlinkTestnet
# Add the contract address to backend/.env as ESCROW_CONTRACT_ADDRESS
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service health + active deals |
| `POST` | `/api/ingest` | Upload documents to RAG |
| `POST` | `/api/chat` | Standard Q&A chat |
| `POST` | `/api/chat/stream` | Streaming Q&A (SSE) |
| `GET` | `/api/attestation` | TEE attestation quote |
| `POST` | `/api/deal/create` | Create deal room |
| `POST` | `/api/deal/{id}/join` | Join deal with budget |
| `POST` | `/api/deal/{id}/negotiate` | Dual-agent negotiation |
| `POST` | `/api/deal/{id}/accept` | Accept deal (on-chain) |
| `POST` | `/api/deal/{id}/exit` | Exit deal (on-chain refund) |
| `GET` | `/api/deal/{id}` | Get deal room state |
| `GET` | `/api/deals` | List all deals |
| `POST` | `/api/deal/{id}/ingest` | Upload docs for deal |

## Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Google Gemini API key |
| `ESCROW_CONTRACT_ADDRESS` | Optional | Deployed NDAIEscrow address |
| `TEE_PRIVATE_KEY` | Optional | TEE wallet private key |
| `ETHERLINK_RPC_URL` | Optional | Defaults to Etherlink Testnet |

### Frontend (`frontend/.env.local`)
| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend URL (default: http://localhost:8000) |

### Contracts (`contracts/.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | ✅ | Wallet private key for deployment |
| `ETHERLINK_RPC_URL` | Optional | Defaults to Etherlink Testnet |
