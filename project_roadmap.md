# 🚀 StealthPitch Deployment Guide

This guide details how to deploy **StealthPitch** to a Phala Network Worker Node (TEE) using `dstack`.

## 1. Prerequisites
*   **Phala Account:** Access to Phala Cloud or a local text-enabled worker node.
*   **Docker:** To build the image.
*   **dstack CLI:** Installed on the deployment machine (or use the web UI).

## 2. Build the TEE-Ready Image
The `Dockerfile` is optimized for TEE (minimal deps, fast boot).

```bash
# Build the image
docker build -t your-username/stealthpitch:v1.0 .

# Push to a public registry (required for Phala workers to pull it)
docker push your-username/stealthpitch:v1.0
```

## 3. Prepare Deployment Configuration
Use the included `docker-compose.yml`. Ensure the following key volume mount is present (it bridges the CVM to the hardware):

```yaml
volumes:
  - /var/run/dstack.sock:/var/run/dstack.sock
```

### Environment Variables
You must inject your secrets securely at runtime. **DO NOT** bake them into the Docker image.
In Phala Dashboard / dstack:
*   `GOOGLE_API_KEY`: `your_gemini_key_here`

## 4. Deploy via Phala Dashboard
1.  Go to **Phala Cloud Dashboard**.
2.  Create **New CVM**.
3.  Select **Custom Container**.
4.  Image: `your-username/stealthpitch:v1.0`.
5.  Port: `8501`.
6.  **Advanced >> Volumes:** Mount `/var/run/dstack.sock` to `/var/run/dstack.sock`.
7.  **Advanced >> Env:** Add `GOOGLE_API_KEY`.
8.  **Deploy**.

## 5. Verify Attestation
Once running, the app will be accessible at the generated URL.
1.  Navigate to **"🛡️ Attestation"**.
2.  The app will display the **Intel TDX Quote**.
3.  (Future Step) Switch the `tee_simulator.py` logic to query the real socket:
    *   Change `tee_simulator.get_tdx_quote()` to make an HTTP GET request to `http://localhost/api/v1/quote` over the unix socket.

## 6. Real Hardware Integration Code
To switch from Simulation to Real Hardware, update `tee_simulator.py` with this snippet:

```python
import requests_unixsocket

def get_real_quote():
    session = requests_unixsocket.Session()
    # dstack exposes endpoints over this unix socket
    resp = session.get('http+unix://%2Fvar%2Frun%2Fdstack.sock/api/v1/quote')
    return resp.json()
```
