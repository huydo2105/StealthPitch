# StealthPitch — Roadmap

## Paper Context

StealthPitch implements the NDAI (Non-Disclosure AI) Agreements model from
[arXiv:2502.07924v1](https://arxiv.org/abs/2502.07924v1) — solving Arrow's
Disclosure Paradox by using AI agents inside a Trusted Execution Environment
(TEE) as an "ironclad NDA."

---

## MVP (Current — Hackathon Demo)

### Core NDAI Protocol
- [x] **Deal Room** — Founder creates room with acceptance threshold,
  investor joins with budget cap
- [x] **Dual-Agent Negotiation** — Buyer's Agent (AB) evaluates invention
  quality and proposes price; Seller's Agent (AS) protects founder's interests
- [x] **Atomic Outcomes** — Accept (funds released via smart contract) or
  Exit (full refund, all data deleted — nothing leaked)
- [x] **NDA Enforcement** — AI agents summarize/paraphrase but never reveal
  raw code, formulas, or exact quotes

### Smart Contract (Etherlink Testnet)
- [x] **NDAIEscrow.sol** — Escrow contract with TEE-authorized settlement
- [x] **On-chain deal lifecycle** — Create → Deposit → Accept/Exit
- [x] **Web3 bridge** — Backend signs transactions via TEE wallet

### TEE Foundation
- [x] **Phala dstack** — Intel TDX attestation with hybrid simulation mode
- [x] **RAG Pipeline** — ChromaDB + Google Gemini 2.5 Flash
- [x] **Confidential document ingestion** — PDF/TXT upload + encryption

### Frontend
- [x] **Landing page** — "Wager-style" design with deep black theme & glow effects
- [x] **Global Header** — Consistent navigation + "Connect Wallet" simulation
- [x] **Deal Room** — Create/join deals with role-based views
- [x] **Negotiation Chat** — Dual-agent responses with accept/exit buttons
- [x] **Vault** — Document upload with encryption status
- [x] **Attestation Dashboard** — TEE health + Intel TDX quote

---

## v2 (Post-Hackathon)

### Protocol Enhancements
- [ ] Multi-round bargaining with counter-offers
- [ ] Multiple invention disclosure (portfolio deals)
- [ ] Time-locked deals with automatic expiry
- [ ] Threshold signatures for multi-party TEE consensus

### Blockchain
- [ ] Mainnet deployment on Etherlink
- [ ] ERC-20 token support (not just native XTZ)
- [ ] Full MetaMask wallet connect integration
- [ ] Deal history and analytics dashboard

### TEE Hardening
- [ ] Multi-TEE replication for fault tolerance
- [ ] Formal verification of NDA system prompt
- [ ] Audit trail with cryptographic proofs
- [ ] Side-channel resistance testing

---

## Deployment Guide

### Prerequisites
- Phala dstack account
- Docker with TEE support (Intel TDX)
- Etherlink testnet XTZ (from [faucet](https://faucet.etherlink.com))

### Build & Deploy
```bash
# 1. Build TEE image
docker compose build

# 2. Deploy smart contract
cd contracts && npm install && npx hardhat run scripts/deploy.js --network etherlinkTestnet

# 3. Configure backend
echo "ESCROW_CONTRACT_ADDRESS=<deployed_address>" >> backend/.env
echo "TEE_PRIVATE_KEY=<deployer_key>" >> backend/.env

# 4. Deploy via Phala Dashboard
#    Upload docker-compose.yml to dstack
```

### Hybrid Mode (Local Dev)
When running outside a real TEE, the system automatically:
- Simulates TDX attestation quotes
- Uses simulated blockchain transactions (if contract not deployed)
- Provides full functionality for demo purposes