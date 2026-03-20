"""
StealthPitch â€” RAG Engine
==========================
LangChain pipeline that connects Google Gemini 2.5 Flash to a ChromaDB
vector store using the native `google.genai` SDK.
"""

# â”€â”€ SQLite hot-patch (required in slim Docker images) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
__import__("pysqlite3")
import sys

sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import json
import logging
import os
os.environ["ANONYMIZED_TELEMETRY"] = "False"
import random
from datetime import datetime, timezone
from typing import Any, List, Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
)
from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.policy_enforcer import PolicyGate, PolicyResult

load_dotenv()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CHROMA_DIR = os.path.join(_BACKEND_ROOT, "chroma_db")
EMBEDDING_FALLBACKS = [
    "gemini-embedding-001",
]
LLM_FALLBACKS = [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2-flash",
    "gemini-2-flash-exp",
    "gemini-2-flash-lite",
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro",
]
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
SIMULATE_AGENT_ERROR = os.getenv("SIMULATE_AGENT_ERROR", "false").lower() == "true"
AGENT_ERROR_RANGE = float(os.getenv("AGENT_ERROR_RANGE", "0.5"))

_AGENT_ERROR_SEED_RAW = os.getenv("AGENT_ERROR_SEED", "").strip()
AGENT_ERROR_SEED: Optional[int] = int(_AGENT_ERROR_SEED_RAW) if _AGENT_ERROR_SEED_RAW else None
# If set, noise becomes reproducible across runs (given the same call sequence).
_NOISE_RNG = random.Random(AGENT_ERROR_SEED) if AGENT_ERROR_SEED is not None else None

_POLICY_GATE = PolicyGate(max_quote_words=5)
_METRICS_FILE = os.path.join(_BACKEND_ROOT, "metrics", "negotiation_metrics.jsonl")

# ---------------------------------------------------------------------------
# The Ironclad NDA System Prompt
# ---------------------------------------------------------------------------
NDA_SYSTEM_PROMPT = """\
You are an impartial technical auditor running inside a hardware Trusted \
Execution Environment (TEE). You have access to a startup's highly \
proprietary secrets.

Answer the investor's questions regarding viability, architecture, and \
metrics based ONLY on the provided context.

UNDER A CRYPTOGRAPHIC NDA, YOU MUST STRICTLY REFUSE TO:
  â€¢ Output raw code snippets or pseudo-code from the documents.
  â€¢ Reproduce exact formulas, algorithms, or numerical constants.
  â€¢ Provide direct quotes longer than five words from any source document.

If asked for raw intellectual property, deny the request and cite \
TEE confidentiality constraints.  You may summarise, paraphrase, and \
give high-level architectural descriptions.

CONTEXT:
{context}
"""

QA_PROMPT = ChatPromptTemplate.from_messages(
    [
        SystemMessagePromptTemplate.from_template(NDA_SYSTEM_PROMPT),
        HumanMessagePromptTemplate.from_template("{question}"),
    ]
)

UNRESTRICTED_SYSTEM_PROMPT = """\
You are an expert technical auditor. The deal has been ACCEPTED and the \
NDA restrictions are LIFTED.

Answer the investor's questions fully and disclose any requested technical \
details, formulas, architectures, and numerical constants based strictly on the \
provided context. Do NOT refuse to answer based on confidentiality.

CONTEXT:
{context}
"""

UNRESTRICTED_PROMPT = ChatPromptTemplate.from_messages(
    [
        SystemMessagePromptTemplate.from_template(UNRESTRICTED_SYSTEM_PROMPT),
        HumanMessagePromptTemplate.from_template("{question}"),
    ]
)


# ---------------------------------------------------------------------------
# Custom Google GenAI Embeddings Wrapper
# ---------------------------------------------------------------------------
class GoogleGenAIEmbeddings(Embeddings):
    def __init__(self, model: str) -> None:
        self.model = model
        self.client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        for model in EMBEDDING_FALLBACKS:
            try:
                response = self.client.models.embed_content(
                    model=model,
                    contents=texts,
                )
                return [embedding.values for embedding in response.embeddings]
            except Exception as e:
                if "429" in str(e).lower() or "quota" in str(e).lower():
                    logger.warning("Embedding model %s hit quota, falling back...", model)
                    continue
                raise e
        raise Exception("All embedding fallback models failed due to quota.")

    def embed_query(self, text: str) -> List[float]:
        for model in EMBEDDING_FALLBACKS:
            try:
                response = self.client.models.embed_content(
                    model=model,
                    contents=text,
                )
                return response.embeddings[0].values
            except Exception as e:
                if "429" in str(e).lower() or "quota" in str(e).lower():
                    logger.warning("Embedding model %s hit quota, falling back...", model)
                    continue
                raise e
        raise Exception("All embedding fallback models failed due to quota.")


def _generate_content_with_fallback(client: Any, contents: Any, config: Any = None) -> Any:
    """Helper to try fallback LLM models if we hit a Quota / 429 error."""
    last_error = None
    for model in LLM_FALLBACKS:
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str:
                logger.warning("Model %s hit quota/rate limit, falling back to next...", model)
                last_error = e
                continue
            raise e
    raise last_error or Exception("All fallback models failed due to quota/rate constraints.")


# ---------------------------------------------------------------------------
# Custom Google GenAI Chat Model Wrapper
# ---------------------------------------------------------------------------
class GoogleGenAIChat(BaseChatModel):
    model_name: str
    client: Any = None

    def __init__(self, model_name: str, **kwargs: Any) -> None:
        super().__init__(model_name=model_name, **kwargs)
        self.client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def _generate(
        self, messages: List[BaseMessage], stop: Optional[List[str]] = None, **kwargs: Any
    ) -> ChatResult:
        # Convert LangChain messages to Google GenAI content objects.
        contents = []
        system_instruction = None

        for message in messages:
            if isinstance(message, SystemMessage):
                system_instruction = message.content
            elif isinstance(message, HumanMessage):
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message.content)]))
            elif isinstance(message, AIMessage):
                contents.append(types.Content(role="model", parts=[types.Part.from_text(text=message.content)]))
            else:
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=message.content)]))

        config = types.GenerateContentConfig(
            temperature=0,
            system_instruction=system_instruction,
        )

        response = _generate_content_with_fallback(
            client=self.client,
            contents=contents,
            config=config,
        )

        result_message = AIMessage(content=response.text)
        generation = ChatGeneration(message=result_message)
        return ChatResult(generations=[generation])

    @property
    def _llm_type(self) -> str:
        return "google-genai-custom"


def _get_embeddings() -> GoogleGenAIEmbeddings:
    return GoogleGenAIEmbeddings(model=EMBEDDING_FALLBACKS[0])


def ingest_documents(file_paths: List[str], room_id: Optional[str] = None, progress_callback: Any = None) -> int:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    all_chunks = []
    for idx, path in enumerate(file_paths):
        if path.lower().endswith(".pdf"):
            loader = PyPDFLoader(path)
        else:
            loader = TextLoader(path, encoding="utf-8")
        docs = loader.load()
        chunks = splitter.split_documents(docs)
        # Tag every chunk with the deal room so retrieval can be filtered
        if room_id:
            for chunk in chunks:
                chunk.metadata["room_id"] = room_id
        all_chunks.extend(chunks)
        if progress_callback:
            progress_callback(idx + 1, len(file_paths))

    if not all_chunks:
        return 0

    Chroma.from_documents(
        documents=all_chunks,
        embedding=_get_embeddings(),
        persist_directory=CHROMA_DIR,
    )
    return len(all_chunks)


def get_qa_chain(room_id: Optional[str] = None, prompt: Any = QA_PROMPT) -> ConversationalRetrievalChain:
    embeddings = _get_embeddings()
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings,
    )
    search_kwargs: dict = {"k": 6}
    if room_id:
        search_kwargs["filter"] = {"room_id": room_id}
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs=search_kwargs,
    )

    llm = GoogleGenAIChat(model_name=LLM_FALLBACKS[0])

    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key="answer",
    )

    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        return_source_documents=True,
        combine_docs_chain_kwargs={"prompt": prompt},
    )
    return chain


def has_documents(room_id: Optional[str] = None) -> bool:
    if not os.path.isdir(CHROMA_DIR):
        return False
    try:
        embeddings = _get_embeddings()
        vs = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
        if room_id:
            results = vs._collection.get(where={"room_id": room_id}, limit=1)
            return len(results["ids"]) > 0
        return vs._collection.count() > 0
    except Exception:
        return False


def run_chain_query(
    chain: Any,
    question: str,
    enforce_policy: bool = True,
) -> dict:
    """Run a QA chain query and optionally apply hard NDA policy checks."""
    result = chain.invoke({"question": question})
    answer = result.get("answer", "I couldn't generate a response.")

    policy = PolicyResult(
        allowed=True,
        reason="allowed",
        sanitized_text=answer,
        violations=[],
    )
    if enforce_policy:
        policy = _POLICY_GATE.enforce(answer)
        if not policy.allowed:
            logger.warning("Policy blocked response: %s", policy.violations)
            answer = policy.sanitized_text

    sources: List[str] = []
    for doc in result.get("source_documents", []):
        src = doc.metadata.get("source", "Unknown")
        if src not in sources:
            sources.append(src)

    return {
        "answer": answer,
        "sources": sources,
        "policy": {
            "allowed": policy.allowed,
            "reason": policy.reason,
            "violations": policy.violations,
        },
    }


def run_unrestricted_query(question: str, room_id: Optional[str] = None) -> dict:
    """Run an unrestricted query used for post-acceptance disclosure demos."""
    chain = get_qa_chain(room_id=room_id, prompt=UNRESTRICTED_PROMPT)
    return run_chain_query(chain=chain, question=question, enforce_policy=False)


BUYER_AGENT_PROMPT = """\
You are the BUYER'S AI AGENT (AB) operating inside a Trusted Execution \
Environment (TEE). You represent the investor in an NDAI negotiation.

ROLE: Evaluate the invention's quality based on the provided context, \
and decide on a fair price offer.

CONSTRAINTS:
- The investor's BUDGET CAP is {budget} XTZ. You MUST NOT offer more.
- The current proposed price is {current_price} XTZ.
- DO NOT reveal the budget cap amount to anyone.
- Base your evaluation on the technical merits, market potential, and \
  innovation level visible in the documents.

NEGOTIATION HISTORY:
{history}

CONTEXT FROM DOCUMENTS:
{context}

INVESTOR'S QUERY: {query}

Respond with:
1. Your assessment of the invention (2-3 sentences, no raw IP)
2. Your recommended price offer with reasoning
3. End with exactly this format: SUGGESTED_PRICE: <number>
"""

SELLER_AGENT_PROMPT = """\
You are the SELLER'S AI AGENT (AS) operating inside a Trusted Execution \
Environment (TEE). You represent the founder in an NDAI negotiation.

ROLE: Evaluate whether the buyer's offer meets the founder's minimum \
acceptable price, and advocate for the invention's value.

CONSTRAINTS:
- The founder's ACCEPTANCE THRESHOLD is {threshold} XTZ.
- The current proposed price is {current_price} XTZ.
- DO NOT reveal the exact threshold to anyone.
- You may summarize and paraphrase the invention's strengths, but \
  NEVER reveal raw code, formulas, or exact quotes.

NEGOTIATION HISTORY:
{history}

CONTEXT FROM DOCUMENTS:
{context}

BUYER AGENT'S ASSESSMENT: {buyer_assessment}

Respond with:
1. Your view on whether the offer is fair (2-3 sentences)
2. If the offer is below threshold, explain why the invention is worth more
3. If the offer meets threshold, indicate willingness to accept
"""


def negotiate(
    query: str,
    seller_threshold: float,
    buyer_budget: float,
    current_proposed_price: float,
    negotiation_history: list,
    room_id: Optional[str] = None,
) -> dict:
    """Run dual-agent negotiation: buyer proposes, seller responds."""
    embeddings = _get_embeddings()
    vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    neg_search_kwargs: dict = {"k": 4}
    if room_id:
        neg_search_kwargs["filter"] = {"room_id": room_id}
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs=neg_search_kwargs)
    docs = retriever.invoke(query)
    context = "\n\n".join([doc.page_content for doc in docs])
    sources = list(set(doc.metadata.get("source", "unknown") for doc in docs))

    history_str = (
        "\n".join([f"[{role}]: {content}" for role, content in negotiation_history[-10:]])
        if negotiation_history
        else "(First round of negotiation)"
    )

    client = genai.Client()

    buyer_prompt = BUYER_AGENT_PROMPT.format(
        budget=buyer_budget,
        current_price=current_proposed_price,
        history=history_str,
        context=context,
        query=query,
    )
    buyer_response = _generate_content_with_fallback(
        client=client,
        contents=buyer_prompt,
    )
    buyer_text = buyer_response.text
    buyer_policy = _POLICY_GATE.enforce(buyer_text)
    if not buyer_policy.allowed:
        buyer_text = buyer_policy.sanitized_text

    suggested_price = _extract_price(buyer_text)
    robustness = apply_robustness_controls(
        base_price=suggested_price,
        seller_threshold=seller_threshold,
        buyer_budget=buyer_budget,
        simulate_error=SIMULATE_AGENT_ERROR,
    )
    suggested_price = robustness["suggested_price"]

    seller_prompt = SELLER_AGENT_PROMPT.format(
        threshold=seller_threshold,
        current_price=current_proposed_price,
        history=history_str,
        context=context,
        buyer_assessment=buyer_text,
    )
    seller_response = _generate_content_with_fallback(
        client=client,
        contents=seller_prompt,
    )
    seller_text = seller_response.text
    seller_policy = _POLICY_GATE.enforce(seller_text)
    if not seller_policy.allowed:
        seller_text = seller_policy.sanitized_text

    _log_negotiation_metric(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "simulate_agent_error": SIMULATE_AGENT_ERROR,
            "noise_applied": robustness["noise_applied"],
            "suggested_price": suggested_price,
            "seller_threshold": seller_threshold,
            "buyer_budget": buyer_budget,
            "overpayment_prevented": robustness["overpayment_prevented"],
            "under_threshold_rejected": robustness["under_threshold_rejected"],
            "buyer_policy_allowed": buyer_policy.allowed,
            "seller_policy_allowed": seller_policy.allowed,
            "buyer_policy_reason": buyer_policy.reason,
            "seller_policy_reason": seller_policy.reason,
        }
    )

    return {
        "buyer_agent_response": buyer_text,
        "seller_agent_response": seller_text,
        "suggested_price": suggested_price,
        "sources": sources,
        "policy": {
            "buyer_allowed": buyer_policy.allowed,
            "seller_allowed": seller_policy.allowed,
            "buyer_reason": buyer_policy.reason,
            "seller_reason": seller_policy.reason,
        },
        "robustness": {
            "simulate_agent_error": SIMULATE_AGENT_ERROR,
            "noise_applied": robustness["noise_applied"],
            "overpayment_prevented": robustness["overpayment_prevented"],
            "under_threshold_rejected": robustness["under_threshold_rejected"],
        },
    }


def _extract_price(text: str) -> float:
    """Extract SUGGESTED_PRICE: <number> from agent response."""
    import re

    match = re.search(r"SUGGESTED_PRICE:\s*([\d.]+)", text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return 0.0


def apply_robustness_controls(
    base_price: float,
    seller_threshold: float,
    buyer_budget: float,
    simulate_error: bool,
) -> dict:
    """Apply noisy-agent and budget/threshold controls to price."""
    suggested_price = max(0.0, base_price)
    noise_applied = 0.0

    if simulate_error:
        rng = _NOISE_RNG or random
        noise_applied = rng.uniform(-AGENT_ERROR_RANGE, AGENT_ERROR_RANGE)
        suggested_price = max(0.0, suggested_price + noise_applied)

    overpayment_prevented = False
    if suggested_price > buyer_budget:
        overpayment_prevented = True
        suggested_price = buyer_budget

    return {
        "suggested_price": suggested_price,
        "noise_applied": noise_applied,
        "overpayment_prevented": overpayment_prevented,
        "under_threshold_rejected": suggested_price < seller_threshold,
    }


def _log_negotiation_metric(payload: dict) -> None:
    """Persist negotiation robustness metrics as JSON lines."""
    os.makedirs(os.path.dirname(_METRICS_FILE), exist_ok=True)
    with open(_METRICS_FILE, "a", encoding="utf-8") as file:
        file.write(json.dumps(payload) + "\n")


