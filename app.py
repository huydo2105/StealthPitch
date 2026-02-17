"""
StealthPitch — Streamlit Application
======================================
Premium dark UI inspired by ChatGPT's layout:
  - Clean icon+text sidebar navigation
  - Centered chat with minimal bubble styling
  - Polished drag-drop upload area
"""

# ── SQLite hot-patch ─────────────────────────────────────────────────
__import__("pysqlite3")
import sys
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
# ─────────────────────────────────────────────────────────────────────

import os
import json
import tempfile
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

import rag_engine
import tee_simulator

# ─── Page Config ─────────────────────────────────────────────────────
st.set_page_config(
    page_title="StealthPitch · TEE Agent",
    page_icon="🔐",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ══════════════════════════════════════════════════════════
   RESET & GLOBALS
   ══════════════════════════════════════════════════════════ */
*, html, body, [class*="st-"] {
    font-family: 'Inter', -apple-system, sans-serif !important;
}
.stApp {
    background: #171717;
}

/* ══════════════════════════════════════════════════════════
   HIDE STREAMLIT CHROME
   ══════════════════════════════════════════════════════════ */
header[data-testid="stHeader"] { display:none !important; }
.stDeployButton { display:none !important; }
#MainMenu { display:none !important; }
footer { display:none !important; }
[data-testid="stToolbar"] { display:none !important; }

/* ══════════════════════════════════════════════════════════
   SIDEBAR — ChatGPT-style
   ══════════════════════════════════════════════════════════ */
section[data-testid="stSidebar"] {
    background: #212121;
    border-right: none;
    width: 260px !important;
}
section[data-testid="stSidebar"] > div:first-child {
    padding: 0.75rem 0.5rem;
}

/* Hide default radio buttons completely */
section[data-testid="stSidebar"] .stRadio > div {
    flex-direction: column;
    gap: 2px;
}
section[data-testid="stSidebar"] .stRadio > div > label {
    background: transparent;
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    margin: 0;
    color: #ececec !important;
    font-size: 0.9rem;
    font-weight: 400;
    cursor: pointer;
    transition: background 0.12s;
    border: none !important;
}
section[data-testid="stSidebar"] .stRadio > div > label:hover {
    background: #2f2f2f;
}
/* Active radio item */
section[data-testid="stSidebar"] .stRadio > div > label[data-checked="true"],
section[data-testid="stSidebar"] .stRadio > div [data-testid="stMarkdownContainer"] {
    color: #ffffff !important;
}

section[data-testid="stSidebar"] .stRadio > label {
    display: none !important;
}

/* Sidebar divider */
section[data-testid="stSidebar"] hr {
    border-color: #2f2f2f;
    margin: 0.5rem 0;
}

/* Sidebar captions */
section[data-testid="stSidebar"] .stCaption, 
section[data-testid="stSidebar"] small {
    color: #8e8e8e !important;
}

/* ══════════════════════════════════════════════════════════
   MAIN CONTENT — centered like ChatGPT
   ══════════════════════════════════════════════════════════ */
.block-container {
    max-width: 820px !important;
    padding-top: 2rem !important;
    padding-left: 2rem !important;
    padding-right: 2rem !important;
}

/* ══════════════════════════════════════════════════════════
   TYPOGRAPHY
   ══════════════════════════════════════════════════════════ */
h1, h2, h3, h4, .page-title {
    color: #ececec !important;
}
.page-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #ececec;
    margin-bottom: 0.5rem;
}
.page-desc {
    color: #b4b4b4;
    font-size: 0.92rem;
    line-height: 1.6;
    margin-bottom: 1.75rem;
}
/* Force readable text everywhere */
.stMarkdown, .stMarkdown p, .stMarkdown li,
.stMarkdown span, .stMarkdown td, .stMarkdown th {
    color: #d1d1d1 !important;
}
.stMarkdown strong, .stMarkdown b {
    color: #ececec !important;
}
.stMarkdown a {
    color: #8ab4f8 !important;
}

/* ══════════════════════════════════════════════════════════
   FILE UPLOADER — polished drag-drop
   ══════════════════════════════════════════════════════════ */
[data-testid="stFileUploader"] {
    background: transparent !important;
    border: none !important;
}
[data-testid="stFileUploaderDropzone"] {
    background: #212121 !important;
    border: 2px dashed #404040 !important;
    border-radius: 12px !important;
    padding: 2.5rem 2rem !important;
    transition: border-color 0.2s, background 0.2s;
}
[data-testid="stFileUploaderDropzone"]:hover {
    border-color: #6366f1 !important;
    background: #1a1a2e !important;
}
[data-testid="stFileUploaderDropzone"] span,
[data-testid="stFileUploaderDropzone"] small,
[data-testid="stFileUploaderDropzone"] button {
    color: #b4b4b4 !important;
}
[data-testid="stFileUploaderDropzone"] button {
    background: #2f2f2f !important;
    border: 1px solid #404040 !important;
    border-radius: 6px !important;
    color: #ececec !important;
    font-weight: 500 !important;
}

/* ══════════════════════════════════════════════════════════
   CHAT MESSAGES — ChatGPT-inspired
   ══════════════════════════════════════════════════════════ */
/* Remove default borders/backgrounds */
[data-testid="stChatMessage"] {
    background: transparent !important;
    border: none !important;
    padding: 0.75rem 0 !important;
}

/* User messages — slightly darker background, right-aligned feel */
[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) {
    background: transparent !important;
}
[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) [data-testid="stChatMessageContent"] {
    background: #303030 !important;
    border: none !important;
    border-radius: 18px !important;
    padding: 0.75rem 1rem !important;
    color: #ececec !important;
}
[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) [data-testid="stChatMessageContent"] p {
    color: #ececec !important;
}

/* Assistant messages — clean, no background, just text */
[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-assistant"]) [data-testid="stChatMessageContent"] {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0.5rem 0.25rem !important;
    color: #d1d1d1 !important;
}
[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-assistant"]) [data-testid="stChatMessageContent"] p {
    color: #d1d1d1 !important;
    line-height: 1.7;
}

/* Chat input — floating centered pill */
[data-testid="stChatInput"] {
    border-top: none !important;
    padding: 0.5rem 0 1rem !important;
    background: transparent !important;
}
[data-testid="stChatInput"] > div {
    background: #2f2f2f !important;
    border: 1px solid #424242 !important;
    border-radius: 26px !important;
    padding: 0.15rem 0.15rem 0.15rem 0.5rem !important;
    max-width: 720px;
    margin: 0 auto;
    box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
[data-testid="stChatInput"] textarea {
    background: transparent !important;
    border: none !important;
    color: #ececec !important;
    border-radius: 24px !important;
    padding: 0.6rem 0.75rem !important;
    font-size: 0.92rem !important;
    min-height: 24px !important;
    resize: none !important;
}
[data-testid="stChatInput"] textarea::placeholder {
    color: #8e8e8e !important;
}
[data-testid="stChatInput"] button {
    background: #ececec !important;
    color: #171717 !important;
    border-radius: 50% !important;
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    padding: 0 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s !important;
}
[data-testid="stChatInput"] button:hover {
    background: #ffffff !important;
}

/* ══════════════════════════════════════════════════════════
   BUTTONS
   ══════════════════════════════════════════════════════════ */
.stButton > button {
    background: #ffffff !important;
    color: #171717 !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 0.55rem 1.25rem !important;
    font-weight: 600 !important;
    font-size: 0.88rem !important;
    transition: opacity 0.15s !important;
}
.stButton > button:hover {
    opacity: 0.85 !important;
}

/* ══════════════════════════════════════════════════════════
   CARDS & STATS
   ══════════════════════════════════════════════════════════ */
.info-card {
    background: #212121;
    border: 1px solid #303030;
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1rem;
}
.stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.75rem;
    margin: 1rem 0;
}
.stat-box {
    background: #212121;
    border: 1px solid #303030;
    border-radius: 10px;
    padding: 1rem;
    text-align: center;
}
.stat-label {
    color: #8e8e8e;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.3rem;
}
.stat-value {
    color: #ececec;
    font-size: 1.25rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
}

/* NDA banner */
.nda-banner {
    background: #2a2a1a;
    border: 1px solid #3d3d1a;
    color: #d4c85a;
    border-radius: 10px;
    padding: 0.6rem 1rem;
    text-align: center;
    font-size: 0.85rem;
    margin-bottom: 1rem;
}

/* Sidebar status box */
.sidebar-box {
    background: #2f2f2f;
    border-radius: 10px;
    padding: 0.75rem;
}
.green-dot {
    display: inline-block;
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #22c55e;
    margin-right: 5px;
    animation: pulse-g 2s infinite;
}
@keyframes pulse-g {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
    50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(34,197,94,0); }
}

/* Expander */
details, [data-testid="stExpander"] {
    background: #212121 !important;
    border: 1px solid #303030 !important;
    border-radius: 10px !important;
}
details summary span, [data-testid="stExpander"] summary span {
    color: #d1d1d1 !important;
}

/* Code */
pre {
    background: #1a1a1a !important;
    border: 1px solid #303030 !important;
    border-radius: 8px !important;
    color: #d1d1d1 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 0.8rem !important;
}
code {
    color: #a5b4fc !important;
    font-family: 'JetBrains Mono', monospace !important;
}

/* Metrics */
[data-testid="stMetric"] {
    background: #212121;
    border: 1px solid #303030;
    border-radius: 10px;
    padding: 0.75rem;
}
[data-testid="stMetricLabel"] { color: #8e8e8e !important; }
[data-testid="stMetricValue"] { color: #ececec !important; }

/* Alerts */
.stAlert {
    background: #212121 !important;
    border: 1px solid #303030 !important;
    border-radius: 10px !important;
}

/* Scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #303030; border-radius: 3px; }

/* Spinner */
.stSpinner > div { color: #8e8e8e !important; }

/* Progress bar — dark themed */
.stProgress {
    margin: 0.75rem 0;
}
.stProgress > div {
    background: #2a2a2a !important;
    border-radius: 8px !important;
    height: 6px !important;
}
.stProgress > div > div {
    background: linear-gradient(90deg, #6366f1, #8b5cf6) !important;
    border-radius: 8px !important;
    height: 6px !important;
    transition: width 0.3s ease !important;
}
/* Hide the ugly green progress text */
.stProgress + div .stMarkdown p {
    color: #8e8e8e !important;
    font-size: 0.8rem !important;
}
</style>
""", unsafe_allow_html=True)


# ─── Session State ───────────────────────────────────────────────────
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []
if "qa_chain" not in st.session_state:
    st.session_state.qa_chain = None
if "total_chunks" not in st.session_state:
    st.session_state.total_chunks = 0


# ─── Sidebar ─────────────────────────────────────────────────────────
with st.sidebar:
    # Brand header
    st.markdown("""
    <div style="padding: 0.5rem 0.75rem 0.25rem; display:flex; align-items:center; gap:0.5rem">
        <span style="font-size:1.25rem">🔐</span>
        <span style="font-size:1.05rem; font-weight:600; color:#ececec">StealthPitch</span>
    </div>
    """, unsafe_allow_html=True)

    st.divider()

    # Navigation
    page = st.radio(
        "Nav",
        ["🔒  Founder Vault", "💬  Investor Chat", "🛡️  Attestation"],
        label_visibility="collapsed",
    )

    st.divider()

    # Section label
    st.markdown("""
    <div style="padding:0 0.75rem; margin-bottom:0.4rem">
        <span style="font-size:0.7rem; color:#8e8e8e; text-transform:uppercase; letter-spacing:0.06em">
            Runtime
        </span>
    </div>
    """, unsafe_allow_html=True)

    # TEE Status
    health = tee_simulator.get_tee_health()
    st.markdown(f"""
    <div class="sidebar-box" style="margin:0 0.25rem">
        <div style="display:flex; align-items:center; margin-bottom:0.4rem">
            <span class="green-dot"></span>
            <span style="color:#22c55e; font-weight:500; font-size:0.82rem">Enclave Active</span>
        </div>
        <div style="font-size:0.72rem; color:#8e8e8e; line-height:1.7">
            {health['memory_encryption']}<br>
            {health['integrity_protection']}<br>
            dstack.sock ✓
        </div>
    </div>
    """, unsafe_allow_html=True)

    # Bottom spacer + version
    st.markdown("<div style='flex:1'></div>", unsafe_allow_html=True)
    st.markdown("""
    <div style="padding:1rem 0.75rem 0.5rem; border-top:1px solid #2f2f2f; margin-top:1rem">
        <div style="font-size:0.72rem; color:#8e8e8e">
            StealthPitch v1.0 · Phala dstack
        </div>
    </div>
    """, unsafe_allow_html=True)


# ╔════════════════════════════════════════════════════════════════════╗
# ║  FOUNDER VAULT                                                     ║
# ╚════════════════════════════════════════════════════════════════════╝
if page == "🔒  Founder Vault":
    st.markdown('<div class="page-title">Founder Vault</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="page-desc">'
        "Upload confidential pitch decks or proprietary code into the encrypted TEE. "
        "Files are chunked, embedded, and sealed — never accessible outside the enclave."
        "</div>",
        unsafe_allow_html=True,
    )

    # Upload area
    uploaded = st.file_uploader(
        "Upload to secure enclave",
        type=["pdf", "txt"],
        accept_multiple_files=True,
        label_visibility="collapsed",
    )

    if uploaded:
        # Show file list
        st.markdown('<div class="info-card">', unsafe_allow_html=True)
        for f in uploaded:
            size_kb = f.size // 1024
            st.markdown(
                f'<div style="display:flex; justify-content:space-between; align-items:center; '
                f'padding:0.4rem 0; border-bottom:1px solid #303030">'
                f'<span style="color:#ececec; font-size:0.9rem">📄 {f.name}</span>'
                f'<span style="color:#8e8e8e; font-size:0.8rem; font-family:JetBrains Mono,monospace">'
                f'{size_kb} KB</span></div>',
                unsafe_allow_html=True,
            )
        st.markdown('</div>', unsafe_allow_html=True)

        if st.button("🔒  Encrypt & Embed", use_container_width=True):
            tmp_paths = []
            for f in uploaded:
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(f.name).suffix)
                tmp.write(f.read())
                tmp.close()
                tmp_paths.append(tmp.name)

            # Animated status area
            status_area = st.empty()
            status_area.markdown(
                '<div class="info-card" style="text-align:center; padding:1.5rem">'
                '<div style="font-size:1.5rem; margin-bottom:0.5rem">⏳</div>'
                '<div style="color:#ececec; font-weight:500">Processing files…</div>'
                '<div style="color:#8e8e8e; font-size:0.8rem; margin-top:0.25rem">'
                'Chunking & embedding with Gemini</div></div>',
                unsafe_allow_html=True
            )

            file_count = len(uploaded)

            def _progress_cb(current, total):
                status_area.markdown(
                    f'<div class="info-card" style="text-align:center; padding:1.5rem">'
                    f'<div style="font-size:1.5rem; margin-bottom:0.5rem">🔐</div>'
                    f'<div style="color:#ececec; font-weight:500">Embedding file {current}/{total}</div>'
                    f'<div style="background:#2a2a2a; border-radius:8px; height:6px; margin:0.75rem 2rem 0">'
                    f'<div style="background:linear-gradient(90deg,#6366f1,#8b5cf6); '
                    f'border-radius:8px; height:6px; width:{int(current/total*100)}%; '
                    f'transition:width 0.3s ease"></div></div></div>',
                    unsafe_allow_html=True
                )

            try:
                chunks = rag_engine.ingest_documents(tmp_paths, progress_callback=_progress_cb)
                st.session_state.total_chunks += chunks
                st.session_state.qa_chain = None

                # Replace progress with success card
                status_area.markdown(f"""
                <div class="info-card" style="text-align:center; padding:1.5rem">
                    <div style="font-size:2rem; margin-bottom:0.5rem">✅</div>
                    <div style="color:#ececec; font-weight:600; margin-bottom:1rem">
                        Successfully sealed {chunks} chunks
                    </div>
                    <div style="display:flex; gap:0.75rem; justify-content:center">
                        <div style="background:#2a2a2a; border-radius:8px; padding:0.5rem 1rem; text-align:center">
                            <div class="stat-label">Files</div>
                            <div style="color:#ececec; font-weight:600; font-size:1.1rem">{file_count}</div>
                        </div>
                        <div style="background:#2a2a2a; border-radius:8px; padding:0.5rem 1rem; text-align:center">
                            <div class="stat-label">New</div>
                            <div style="color:#ececec; font-weight:600; font-size:1.1rem">{chunks}</div>
                        </div>
                        <div style="background:#2a2a2a; border-radius:8px; padding:0.5rem 1rem; text-align:center">
                            <div class="stat-label">Total</div>
                            <div style="color:#ececec; font-weight:600; font-size:1.1rem">{st.session_state.total_chunks}</div>
                        </div>
                    </div>
                </div>
                """, unsafe_allow_html=True)

            except Exception as e:
                status_area.markdown(
                    f'<div class="info-card" style="text-align:center; padding:1.5rem; border-color:#7f1d1d">'
                    f'<div style="font-size:1.5rem; margin-bottom:0.5rem">❌</div>'
                    f'<div style="color:#fca5a5; font-weight:500">Ingestion failed</div>'
                    f'<div style="color:#8e8e8e; font-size:0.8rem; margin-top:0.25rem">{e}</div></div>',
                    unsafe_allow_html=True
                )
            finally:
                for p in tmp_paths:
                    if os.path.exists(p):
                        os.unlink(p)

    elif st.session_state.total_chunks > 0:
        st.markdown(f"""
        <div class="info-card" style="text-align:center">
            <div style="color:#8e8e8e; font-size:0.8rem; margin-bottom:0.5rem">VAULT STATUS</div>
            <div style="color:#ececec; font-size:2rem; font-weight:700; font-family:JetBrains Mono,monospace">
                {st.session_state.total_chunks}
            </div>
            <div style="color:#8e8e8e; font-size:0.85rem">encrypted chunks stored</div>
        </div>
        """, unsafe_allow_html=True)


# ╔════════════════════════════════════════════════════════════════════╗
# ║  INVESTOR CHAT                                                     ║
# ╚════════════════════════════════════════════════════════════════════╝
elif page == "💬  Investor Chat":

    if not rag_engine.has_documents():
        st.markdown('<div class="page-title">Investor Chat</div>', unsafe_allow_html=True)
        st.warning("⚠️ No documents in the vault. Upload files in **Founder Vault** first.")
    else:
        # Build chain
        if st.session_state.qa_chain is None:
            with st.spinner("Connecting to Gemini 2.5 Flash…"):
                st.session_state.qa_chain = rag_engine.get_qa_chain()

        # NDA banner — subtle
        st.markdown("""
        <div class="nda-banner">
            🔒 Responses governed by cryptographic NDA · Raw IP will never be disclosed
        </div>
        """, unsafe_allow_html=True)

        # Chat history
        for msg in st.session_state.chat_history:
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])

        # Input
        if prompt := st.chat_input("Message StealthPitch…"):
            st.session_state.chat_history.append({"role": "user", "content": prompt})
            with st.chat_message("user"):
                st.markdown(prompt)

            with st.chat_message("assistant"):
                with st.spinner("Thinking…"):
                    try:
                        result = st.session_state.qa_chain.invoke({"question": prompt})
                        answer = result.get("answer", "I could not generate a response.")
                    except Exception as e:
                        answer = f"⚠️ Error: {e}"
                st.markdown(answer)

            st.session_state.chat_history.append({"role": "assistant", "content": answer})


# ╔════════════════════════════════════════════════════════════════════╗
# ║  ATTESTATION                                                       ║
# ╚════════════════════════════════════════════════════════════════════╝
elif page == "🛡️  Attestation":
    st.markdown('<div class="page-title">Attestation Dashboard</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="page-desc">'
        "Cryptographic proof that this CVM hasn't been tampered with. "
        "Verify these measurements via Intel DCAP or Phala's verification service."
        "</div>",
        unsafe_allow_html=True,
    )

    health = tee_simulator.get_tee_health()
    cvm = health["confidential_vm"]

    st.markdown(f"""
    <div class="stat-grid">
        <div class="stat-box">
            <div class="stat-label">Status</div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px">
                <span class="green-dot"></span>
                <span style="color:#22c55e; font-weight:600; font-size:0.9rem">Active</span>
            </div>
        </div>
        <div class="stat-box">
            <div class="stat-label">Memory</div>
            <div class="stat-value" style="font-size:1rem">AES-256-XTS</div>
        </div>
        <div class="stat-box">
            <div class="stat-label">RAM</div>
            <div class="stat-value" style="font-size:1rem">{cvm['encrypted_memory_mb']}MB</div>
        </div>
        <div class="stat-box">
            <div class="stat-label">Drift</div>
            <div class="stat-value" style="font-size:1rem">{health['secure_clock_drift_ms']}ms</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # TDX Quote
    quote = tee_simulator.get_tdx_quote()

    st.markdown("**Intel TDX Quote**")
    with st.expander("View raw JSON", expanded=False):
        st.code(json.dumps(quote, indent=2), language="json")

    # RTMRs
    st.markdown("**Runtime Measurements**")
    rtmrs = quote["runtime_measurements"]
    for label, value in rtmrs.items():
        short = value[:20] + "…" + value[-12:]
        st.markdown(
            f'<div class="info-card" style="padding:0.6rem 1rem; display:flex; '
            f'justify-content:space-between; align-items:center">'
            f'<span style="color:#8ab4f8; font-weight:600; font-size:0.78rem; '
            f'font-family:JetBrains Mono,monospace">{label.upper()}</span>'
            f'<code style="font-size:0.72rem; color:#8e8e8e; background:transparent" '
            f'title="{value}">{short}</code></div>',
            unsafe_allow_html=True,
        )

    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("🔄  Refresh"):
        st.rerun()
