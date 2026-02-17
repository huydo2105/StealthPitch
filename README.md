# StealthPitch MVP — TEE-Based AI Due Diligence Agent

A production-ready MVP for the Shape Rotator Virtual Hackathon (Bonus Track). This agent runs inside a Phala Network `dstack` Confidential Virtual Machine (CVM), enforcing strict NDA compliance via Gemini 2.5 Flash and Intel TDX attestation.

## 🚀 Key Features

*   **🔒 Founder Vault:** Securely upload & embed confidential documents (PDF/TXT) into TEE memory (never touches disk unencrypted).
*   **💬 Investor Chat:** Interrogate the AI agent. The agent is under a rigorous cryptographic NDA system prompt and will refuse to leak raw IP.
*   **🛡️ Attestation Dashboard:** Verify the CVM's integrity with real-time Intel TDX remote attestation quotes.
*   **💎 Premium UI:** Glassmorphism design, dark mode, and animated interactions.

## 🛠️ Stack

*   **Frontend:** Streamlit (Custom CSS)
*   **AI Logic:** Google Gemini 2.5 Flash + Gemini Embedding 001
*   **RAG:** LangChain + ChromaDB (Persistent)
*   **Infrastructure:** Phala Network (dstack) + Docker

## ⚡ Quick Start

1.  **Set API Key:**
    ```bash
    cp .env.example .env
    # Edit .env and add your GOOGLE_API_KEY
    ```

2.  **Run Locally:**
    ```bash
    pip install -r requirements.txt
    streamlit run app.py
    ```

3.  **Deploy to Phala/dstack:**
    ```bash
    docker-compose up --build -d
    ```

## 🐛 Troubleshooting

*   **SQLite Error:** The app uses `pysqlite3-binary` to fix older system SQLite versions automatically.
*   **404 Model Error:** Ensure you are using `gemini-embedding-001` (set in `rag_engine.py`).
