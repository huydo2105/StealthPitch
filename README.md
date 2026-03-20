# StealthPitch

Secure invention disclosure using AI agents inside a Trusted Execution Environment (TEE), aligned to NDAI (arXiv:2502.07924v1).

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

## Deployment

### Docker Compose (Local)

```bash
# 1. Create .env from template
cp .env.production .env
# Edit .env and fill in your secrets

# 2. Build and run
docker compose build --no-cache
docker compose up -d

# 3. Check logs
docker compose logs -f backend
docker compose logs -f frontend
```

The frontend is served on port **80**, the backend on port **8000**.

### Azure VM (Production)

#### 1. Provision the VM

```bash
# Create resource group
az group create --name StealthPitch-RG --location eastus

# Create VM
az vm create \
  --resource-group StealthPitch-RG \
  --name stealthpitch-vm \
  --image Canonical:0001-com-ubuntu-server-jammy:22_04-lts-gen2:latest \
  --size Standard_DC2s_v3 \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard

# Open ports
az vm open-port -g StealthPitch-RG -n stealthpitch-vm --port 80 --priority 100
az vm open-port -g StealthPitch-RG -n stealthpitch-vm --port 8000 --priority 101
```

#### 2. Install Docker on the VM

```bash
ssh azureuser@<VM_PUBLIC_IP>

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
exit
# Re-login for group change
ssh azureuser@<VM_PUBLIC_IP>
docker compose version  # verify
```

#### 3. Deploy

```bash
git clone <your-repo-url> ~/StealthPitch
cd ~/StealthPitch

# Create .env
cat > .env << 'EOF'
VM_PUBLIC_IP=<YOUR_VM_PUBLIC_IP>
GOOGLE_API_KEY=<your-key>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ANON_KEY=<your-anon-key>
ESCROW_CONTRACT_ADDRESS=0xF3E699115904D8DbBc0202Eb24FBd6aD8d9b9ae7
TEE_PRIVATE_KEY=<your-tee-wallet-private-key>
SECURITY_PROFILE=high-value
EXPLORER_URL=https://shadownet.explorer.etherlink.com
EOF

docker compose build --no-cache
docker compose up -d
```

#### 4. Verify

```bash
curl http://<VM_PUBLIC_IP>:8000/api/health
curl http://<VM_PUBLIC_IP>:8000/api/attestation
# Open http://<VM_PUBLIC_IP> in browser
```

### TEE Attestation Modes

| Mode | Environment | Enclave Status | TEE Type |
|---|---|---|---|
| Intel SGX (Real) | Azure `DC2s_v3` VM | ðŸŸ¢ ACTIVE | Intel SGX (Azure CVM) |
| Simulated | Local dev | ðŸŸ¡ SIMULATED | TDX (Simulated) |

The backend auto-detects which mode is available and falls back gracefully.

## Key API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | health + active deals |
| POST | `/api/chat` | policy-gated chat with signed response |
| POST | `/api/chat/stream` | streaming chat with final signed metadata |
| POST | `/api/chat` / `/api/chat/stream` + `deal_room_id` | shared room session |
| GET | `/api/attestation` | quote + health + security profile |
| POST | `/api/deal/{id}/negotiate` | dual-agent negotiation |
| POST | `/api/deal/{id}/accept` | accept deal |
| POST | `/api/deal/{id}/exit` | exit deal |
| POST | `/api/deal/{id}/reveal` | unrestricted reveal (accepted deals only) |
| POST | `/api/deal/{id}/confirm_tx` | confirm on-chain tx from frontend |

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
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role key |
| `ESCROW_CONTRACT_ADDRESS` | yes | Deployed NDAIEscrow contract address |
| `TEE_PRIVATE_KEY` | yes | TEE authority wallet private key |
| `ETHERLINK_RPC_URL` | no | RPC endpoint (default: Etherlink Shadownet) |
| `SECURITY_PROFILE` | no | `baseline` or `high-value` |
| `SIMULATE_AGENT_ERROR` | no | enable noisy-agent simulation (`true/false`) |
| `AGENT_ERROR_RANGE` | no | noise amplitude (float) |
| `AGENT_ERROR_SEED` | no | reproducible noise seed (int); only used when `SIMULATE_AGENT_ERROR=true` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Backend URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS` | yes | NDAIEscrow contract address |
| `NEXT_PUBLIC_EXPLORER_URL` | yes | Etherlink block explorer URL |

### Docker Compose (`.env` at project root)

| Variable | Required | Description |
|---|---|---|
| `VM_PUBLIC_IP` | yes | Public IP of the VM (used for `NEXT_PUBLIC_API_URL`) |
| `SUPABASE_ANON_KEY` | yes | Passed as frontend build arg |
| `EXPLORER_URL` | no | Block explorer URL (default: Etherlink Shadownet) |
| *(plus all backend vars above)* | | |

