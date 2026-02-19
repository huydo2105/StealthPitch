"""
StealthPitch — RAG Engine
==========================
LangChain pipeline that connects Google Gemini 2.5 Flash to a ChromaDB
vector store using the native `google.genai` SDK.
"""

# ── SQLite hot-patch (required in slim Docker images) ────────────────
__import__("pysqlite3")
import sys
sys.modules["sqlite3"] = sys.modules.pop("pysqlite3")
# ─────────────────────────────────────────────────────────────────────

import os
from typing import Any, List, Optional

from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_chroma import Chroma
from langchain.chains import ConversationalRetrievalChain
from langchain.memory import ConversationBufferMemory
from langchain.prompts import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
)
from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_core.outputs import ChatResult, ChatGeneration

from google import genai
from google.genai import types

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHROMA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
EMBEDDING_MODEL = "gemini-embedding-001"
LLM_MODEL = "gemini-2.5-flash" 
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

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
  • Output raw code snippets or pseudo-code from the documents.
  • Reproduce exact formulas, algorithms, or numerical constants.
  • Provide direct quotes longer than five words from any source document.

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


# ---------------------------------------------------------------------------
# Custom Google GenAI Embeddings Wrapper
# ---------------------------------------------------------------------------
class GoogleGenAIEmbeddings(Embeddings):
    def __init__(self, model: str):
        self.model = model
        self.client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        response = self.client.models.embed_content(
            model=self.model,
            contents=texts,
        )
        return [e.values for e in response.embeddings]

    def embed_query(self, text: str) -> List[float]:
        response = self.client.models.embed_content(
            model=self.model,
            contents=text,
        )
        return response.embeddings[0].values


# ---------------------------------------------------------------------------
# Custom Google GenAI Chat Model Wrapper
# ---------------------------------------------------------------------------
class GoogleGenAIChat(BaseChatModel):
    model_name: str
    client: Any = None

    def __init__(self, model_name: str, **kwargs):
        super().__init__(model_name=model_name, **kwargs)
        self.client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def _generate(
        self, messages: List[BaseMessage], stop: Optional[List[str]] = None, **kwargs
    ) -> ChatResult:
        # Convert LangChain messages to Google GenAI format if needed, 
        # or simplified text interactions if using generate_content.
        
        # New SDK generate_content usually takes a single prompt or a list of contents.
        # We need to construct the history.
        
        contents = []
        system_instruction = None
        
        for msg in messages:
            if isinstance(msg, SystemMessage):
                system_instruction = msg.content
            elif isinstance(msg, HumanMessage):
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=msg.content)]))
            elif isinstance(msg, AIMessage):
                contents.append(types.Content(role="model", parts=[types.Part.from_text(text=msg.content)]))
            else:
                # Fallback for other types
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=msg.content)]))

        config = types.GenerateContentConfig(
            temperature=0,
            system_instruction=system_instruction
        )

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config
        )

        message = AIMessage(content=response.text)
        generation = ChatGeneration(message=message)
        return ChatResult(generations=[generation])

    @property
    def _llm_type(self) -> str:
        return "google-genai-custom"


# ---------------------------------------------------------------------------
# Embedding helper
# ---------------------------------------------------------------------------
def _get_embeddings() -> GoogleGenAIEmbeddings:
    return GoogleGenAIEmbeddings(model=EMBEDDING_MODEL)


# ---------------------------------------------------------------------------
# Document ingestion
# ---------------------------------------------------------------------------
def ingest_documents(file_paths: List[str], progress_callback=None) -> int:
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


# ---------------------------------------------------------------------------
# Conversational QA chain
# ---------------------------------------------------------------------------
def get_qa_chain() -> ConversationalRetrievalChain:
    embeddings = _get_embeddings()
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings,
    )
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 6},
    )

    llm = GoogleGenAIChat(model_name=LLM_MODEL)

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
        combine_docs_chain_kwargs={"prompt": QA_PROMPT},
    )
    return chain


def has_documents() -> bool:
    if not os.path.isdir(CHROMA_DIR):
        return False
    try:
        embeddings = _get_embeddings()
        vs = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
        return vs._collection.count() > 0
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Dual-Agent Negotiation (NDAI Paper §4)
# ---------------------------------------------------------------------------

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
) -> dict:
    """
    Run dual-agent negotiation: Buyer's agent evaluates and proposes,
    Seller's agent evaluates and responds.
    """
    # Get relevant context from RAG
    embeddings = _get_embeddings()
    vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 4})
    docs = retriever.invoke(query)
    context = "\n\n".join([d.page_content for d in docs])
    sources = list(set(d.metadata.get("source", "unknown") for d in docs))

    # Format negotiation history
    history_str = "\n".join(
        [f"[{role}]: {content}" for role, content in negotiation_history[-10:]]
    ) if negotiation_history else "(First round of negotiation)"

    client = genai.Client()

    # Step 1: Buyer's Agent evaluates and proposes price
    buyer_prompt = BUYER_AGENT_PROMPT.format(
        budget=buyer_budget,
        current_price=current_proposed_price,
        history=history_str,
        context=context,
        query=query,
    )
    buyer_response = client.models.generate_content(
        model=LLM_MODEL,
        contents=buyer_prompt,
    )
    buyer_text = buyer_response.text

    # Extract suggested price from buyer agent response
    suggested_price = _extract_price(buyer_text)
    if suggested_price > buyer_budget:
        suggested_price = buyer_budget  # Cap at budget

    # Step 2: Seller's Agent evaluates the offer
    seller_prompt = SELLER_AGENT_PROMPT.format(
        threshold=seller_threshold,
        current_price=current_proposed_price,
        history=history_str,
        context=context,
        buyer_assessment=buyer_text,
    )
    seller_response = client.models.generate_content(
        model=LLM_MODEL,
        contents=seller_prompt,
    )
    seller_text = seller_response.text

    return {
        "buyer_agent_response": buyer_text,
        "seller_agent_response": seller_text,
        "suggested_price": suggested_price,
        "sources": sources,
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

