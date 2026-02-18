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
