# StealthPitch Roadmap (Paper-Aligned)

This roadmap tracks implementation against NDAI paper milestones and current system status.

## Milestone Status (M1-M6)

### M1 Hard NDA Enforcement Layer
- [x] `backend/app/core/policy_enforcer.py` with deterministic checks
- [x] Policy applied to standard chat and dual-agent responses
- [x] Sanitized blocked outputs with reason codes
- [x] Policy metadata returned by backend APIs

### M2 Conditional Disclosure + Payment Handshake
- [x] Deal lifecycle in backend + contract (`create/join/negotiate/accept/exit`)
- [x] Disclosure gate endpoint: `POST /api/deal/{id}/reveal`
- [x] Reveal endpoint locked until deal status is `accepted`
- [x] Frontend shows post-accept reveal action

### M3 Noisy-Agent Robustness Controls
- [x] `SIMULATE_AGENT_ERROR` and `AGENT_ERROR_RANGE` config
- [x] Price noise injection and budget-cap truncation
- [x] Threshold rejection signals
- [x] JSONL metrics written for robustness analysis

### M4 Attestation-to-Response Binding
- [x] Response payload signing in `backend/app/services/tee_service.py`
- [x] Chat/stream/negotiate/reveal responses include signature metadata
- [x] Frontend verification helper (`frontend/src/lib/signature.ts`)
- [x] Verified signature badge in chat UI

### M5 Security Scope for High-Value Secrets
- [x] `SECURITY_PROFILE` toggle (`baseline`, `high-value`)
- [x] Simulated multi-provider quote data in high-value mode
- [x] Profile surfaced in attestation dashboard

### M6 Claim-Level Evaluation Harness
- [x] `backend/app/evaluation/evaluate_claims.py` added
- [x] Checks for M1-M5 behavior
- [x] Report output to `backend/evaluation_report.md`

## Current Gaps to Production-Grade Paper Demo

- [ ] Replace heuristic policy gate with stronger semantic leakage detection.
- [ ] Bind signatures to externally verifiable attestation roots (not only local key simulation).
- [ ] Add reproducible benchmark dataset for false-positive/false-negative policy metrics.
- [ ] Add CI pipeline to run `app/evaluation/evaluate_claims.py` and publish report artifacts.
- [ ] Add stronger deal-scoped document isolation for concurrent rooms.

## Next Iteration Plan

### P1 Verification Hardening
- Verify signatures against remote attestable key material.
- Add challenge-response freshness checks and replay protection.

### P2 Policy Quality
- Add similarity-based leakage checks against retrieved source chunks.
- Expand adversarial corpus and publish precision/recall metrics.

### P3 Multi-TEE Realism
- Move from simulated multi-provider quotes to an adapter layer for real providers.
- Add threshold-verification logic and policy around quorum failure.

### P4 Evaluation and CI
- Add automated job to run evaluation harness per PR.
- Store and compare historical claim-level pass/fail trends.

## Progress Report Template

```markdown
## Progress Report
- Timestamp: 2026-02-19T00:00:00Z
- Chosen solution + rationale:
  - (Describe selected implementation option and why.)
- Summary of applied changes:
  - (List updated files and behavior changes.)
- Status:
  - success | warnings | error
- Next steps / TODOs:
  - [ ] ...
```

## Deployment Quick Reference

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```