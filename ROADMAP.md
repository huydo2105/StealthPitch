# 🚀 StealthPitch Deployment Guide

This guide details how to deploy **StealthPitch** to a Phala Network Worker Node (TEE) using `dstack`.

## 1. Prerequisites
*   **Phala Account:** Access to Phala Cloud or a local text-enabled worker node.
*   **Docker:** To build the image.
*   **dstack CLI:** Installed on the deployment machine (or use the web UI).

## 2. Build the TEE-Ready Image
The `Dockerfile` is optimized for TEE (minimal deps, fast boot).

```bash
# Build the backend image
cd backend
docker build -t your-username/stealthpitch-backend:v2.0 .

# Build the frontend image
cd ../frontend
docker build -t your-username/stealthpitch-frontend:v2.0 .

# Push to a public registry (required for Phala workers to pull it)
docker push your-username/stealthpitch-backend:v2.0
docker push your-username/stealthpitch-frontend:v2.0
```

## 3. Prepare Deployment Configuration
Use a `docker-compose.yml` that includes the TEE socket volume.

**Important:** The dstack socket at `/var/run/dstack.sock` MUST be mounted into the backend container.

```yaml
services:
  backend:
    image: your-username/stealthpitch-backend:v2.0
    network_mode: "host"  # Often simplest for CVMs, or use bridge
    volumes:
      - /var/run/dstack.sock:/var/run/dstack.sock
    environment:
      - GOOGLE_API_KEY=your_key_here
```

## 4. Deploy via Phala Dashboard
1.  Go to **Phala Cloud Dashboard**.
2.  Create **New CVM**.
3.  Select **Custom Container**.
4.  Image: `your-username/stealthpitch-backend:v2.0` (or use a compose file).
5.  **Advanced >> Volumes:** Mount `/var/run/dstack.sock` to `/var/run/dstack.sock`.
6.  **Advanced >> Env:** Add `GOOGLE_API_KEY`.
7.  **Deploy**.

## 5. Verify Attestation
The application automatically detects the TEE environment.

1.  Navigate to **"🛡️ Attestation"** in the frontend.
2.  If running on real hardware, you will see:
    *   **Enclave Status:** ACTIVE
    *   **Memory Encryption:** AES-256-XTS (TDX)
    *   **Actual Quote:** A real Intel TDX quote fetched from the dstack socket.
3.  If running locally (no socket), it falls back to **Simulation Mode**.

## 6. Hybrid Mode Implementation
The backend (`tee_manager.py`) implements a hybrid strategy:

```python
# Actual logic in backend/tee_manager.py
def get_tdx_quote():
    if os.path.exists("/var/run/dstack.sock"):
        # Real Hardware
        return fetch_real_quote_from_socket()
    else:
        # Local Development
        return simulate_quote()
```

No code changes are needed to switch between Dev and Prod. Just mount the socket!