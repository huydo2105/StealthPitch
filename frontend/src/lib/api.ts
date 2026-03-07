/**
 * StealthPitch — API Client
 * Typed fetch helpers for the FastAPI backend.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase";
import { etherlinkShadownet } from "./chains";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────

export interface HealthResponse {
    status: string;
    has_documents: boolean;
    version: string;
    active_deals: number;
}

export interface IngestResponse {
    chunks_created: number;
    files_processed: number;
    message: string;
}

export interface ChatResponse {
    answer: string;
    session_id: string;
    sources: string[];
    policy: Record<string, unknown>;
    attestation_quote: Record<string, unknown>;
    signature: string;
    signature_algorithm: string;
    signature_payload: string;
    signing_public_key_pem: string;
}

export interface ChatSession {
    id: string;
    wallet_address: string;
    deal_room_id?: string | null;
    title: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChatMessageRow {
    id: string;
    session_id: string;
    wallet_address: string;
    role: "user" | "assistant" | "buyer_agent" | "seller_agent" | "system" | "founder" | "investor" | "agent";
    content: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface AttestationResponse {
    quote: {
        version: number;
        tee_type: string;
        attestation_provider: string;
        mrenclave: string;
        mrsigner: string;
        isv_prod_id: number;
        isv_svn: number;
        runtime_measurements: Record<string, string>;
        report_data: string;
        tcb_status: string;
        advisory_ids: string[];
        timestamp: string;
        pck_certificate_chain: string[];
        signature: string;
        security_profile?: string;
        multi_provider_quotes?: Array<{ provider: string; quote: string }>;
    };
    health: {
        enclave_status: string;
        memory_encryption: string;
        integrity_protection: string;
        seal_key_status: string;
        secure_clock_drift_ms: number;
        dstack_socket: string;
        dstack_connected: boolean;
        last_heartbeat: string;
        uptime_seconds: number;
        security_profile?: string;
        threshold_mode?: boolean;
        signing_algorithm?: string;
        signing_public_key_pem?: string;
        confidential_vm: {
            provider: string;
            cpu_flags: string[];
            numa_nodes: number;
            encrypted_memory_mb: number;
        };
    };
}

// ── Deal Room Types ─────────────────────────────────────────────────

export interface DealRoom {
    room_id: string;
    status: "created" | "funded" | "negotiating" | "accepted" | "exited" | "cancelled";
    seller_address: string;
    seller_threshold: number;
    documents_ingested: boolean;
    buyer_address: string;
    buyer_budget: number;
    proposed_price: number;
    negotiation_count: number;
    negotiation_history: Array<{
        role: string;
        content: string;
        timestamp: string;
    }>;
    tx_history: Array<{
        action: string;
        result: Record<string, unknown>;
        timestamp: string;
    }>;
    created_at: string;
    settled_at: string | null;
    blockchain: {
        available: boolean;
        explorer: string;
        onchain_status: Record<string, unknown> | null;
    };
    session_id: string;
}

export interface NegotiateResponse {
    buyer_agent: string;
    seller_agent: string;
    suggested_price: number;
    threshold_met: boolean;
    within_budget: boolean;
    sources: string[];
    policy?: Record<string, unknown>;
    robustness?: Record<string, unknown>;
    attestation_quote?: Record<string, unknown>;
    signature?: string;
    signature_algorithm?: string;
    signature_payload?: string;
    signing_public_key_pem?: string;
    session_id: string;
    room: DealRoom;
}

export interface DealOutcome {
    status: "accepted" | "exited";
    message: string;
    room: DealRoom;
}

export interface RevealResponse {
    answer: string;
    sources: string[];
    attestation_quote: Record<string, unknown>;
    signature: string;
    signature_algorithm: string;
    signature_payload: string;
    signing_public_key_pem: string;
}

// ── Core API Functions ──────────────────────────────────────────────

export async function checkHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error("Health check failed");
    return res.json();
}

export async function ingestFiles(files: File[]): Promise<IngestResponse> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
    }
    return res.json();
}

export function streamChat(
    query: string,
    sessionId: string | undefined,
    walletAddress: string | undefined,
    dealRoomId: string | undefined,
    participantRole: string | undefined,
    onChunk: (chunk: string) => void,
    onDone: (payload: {
        sessionId: string;
        sources: string[];
        policy?: Record<string, unknown>;
        attestationQuote?: Record<string, unknown>;
        signature?: string;
        signatureAlgorithm?: string;
        signaturePayload?: string;
        signingPublicKeyPem?: string;
    }) => void,
    onError: (error: string) => void
): AbortController {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            session_id: sessionId,
            wallet_address: walletAddress,
            deal_room_id: dealRoomId,
            participant_role: participantRole,
        }),
        signal: controller.signal,
    })
        .then(async (response) => {
            if (!response.ok) {
                const err = await response
                    .json()
                    .catch(() => ({ detail: "Stream failed" }));
                onError(err.detail || "Stream failed");
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                onError("No response stream");
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.done) {
                                onDone({
                                    sessionId: data.session_id,
                                    sources: data.sources || [],
                                    policy: data.policy,
                                    attestationQuote: data.attestation_quote,
                                    signature: data.signature,
                                    signatureAlgorithm: data.signature_algorithm,
                                    signaturePayload: data.signature_payload,
                                    signingPublicKeyPem: data.signing_public_key_pem,
                                });
                            } else if (data.chunk) {
                                onChunk(data.chunk);
                            }
                        } catch {
                            // Ignore parse errors
                        }
                    }
                }
            }
        })
        .catch((err) => {
            if (err.name !== "AbortError") {
                onError(err.message);
            }
        });

    return controller;
}

export async function fetchChatSessions(walletAddress: string): Promise<ChatSession[]> {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${walletAddress}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "List sessions failed" }));
        throw new Error(err.detail || "List sessions failed");
    }
    const data = await res.json();
    return data.sessions || [];
}

export async function fetchChatMessages(
    sessionId: string
): Promise<ChatMessageRow[]> {
    const res = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "List messages failed" }));
        throw new Error(err.detail || "List messages failed");
    }
    const data = await res.json();
    return data.messages || [];
}

export function subscribeToSessionMessages(
    sessionId: string,
    onInsert: (message: ChatMessageRow) => void
): () => void {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
        return () => {
            // no-op when realtime is not configured
        };
    }

    const channel = supabase
        .channel(`chat_messages_${sessionId}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "chat_messages",
                filter: `session_id=eq.${sessionId}`,
            },
            (payload) => {
                onInsert(payload.new as ChatMessageRow);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export function subscribeToDealRoom(
    roomId: string,
    onUpdate: (room: DealRoom) => void
): () => void {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
        return () => {
            // no-op
        };
    }

    const channel = supabase
        .channel(`deal_rooms_${roomId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "deal_rooms",
                filter: `room_id=eq.${roomId}`,
            },
            (payload) => {
                onUpdate(payload.new as DealRoom);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

export async function getAttestation(): Promise<AttestationResponse> {
    const res = await fetch(`${API_BASE}/api/attestation`);
    if (!res.ok) throw new Error("Attestation fetch failed");
    return res.json();
}

// ── Deal Room API Functions ─────────────────────────────────────────

export async function createDeal(
    sellerAddress: string,
    threshold: number
): Promise<DealRoom> {
    const res = await fetch(`${API_BASE}/api/deal/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seller_address: sellerAddress, threshold }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Create deal failed" }));
        throw new Error(err.detail || "Create deal failed");
    }
    return res.json();
}

export async function joinDeal(
    roomId: string,
    buyerAddress: string,
    budget: number
): Promise<DealRoom> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_address: buyerAddress, budget }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Join deal failed" }));
        throw new Error(err.detail || "Join deal failed");
    }
    return res.json();
}

export async function getDeal(roomId: string): Promise<DealRoom> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Get deal failed" }));
        throw new Error(err.detail || "Get deal failed");
    }
    return res.json();
}

export async function listDeals(): Promise<DealRoom[]> {
    const res = await fetch(`${API_BASE}/api/deals`);
    if (!res.ok) throw new Error("List deals failed");
    return res.json();
}

export async function listWalletDeals(walletAddress: string): Promise<DealRoom[]> {
    const res = await fetch(`${API_BASE}/api/deals/wallet/${walletAddress}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "List wallet deals failed" }));
        throw new Error(err.detail || "List wallet deals failed");
    }
    return res.json();
}

/** Call this after wagmi's isConfirmed fires to update backend deal status.
 *  action="create"  → records the tx hash (status stays "created")
 *  action="deposit" → records the tx hash and advances status to "funded"
 */
export async function confirmTx(
    roomId: string,
    action: "create" | "deposit",
    txHash: string
): Promise<DealRoom> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/confirm_tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, tx_hash: txHash, chain_id: etherlinkShadownet.id }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "confirm_tx failed" }));
        throw new Error(err.detail || "confirm_tx failed");
    }
    return res.json();
}

export async function negotiateDeal(
    roomId: string,
    query: string,
    role: string = "investor",
    walletAddress?: string,
    proposePrice?: number
): Promise<NegotiateResponse> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/negotiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, role, wallet_address: walletAddress, propose_price: proposePrice }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Negotiation failed" }));
        throw new Error(err.detail || "Negotiation failed");
    }
    return res.json();
}

export async function acceptDeal(roomId: string): Promise<DealOutcome> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/accept`, {
        method: "POST",
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Accept failed" }));
        throw new Error(err.detail || "Accept failed");
    }
    return res.json();
}

export async function exitDeal(roomId: string): Promise<DealOutcome> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/exit`, {
        method: "POST",
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Exit failed" }));
        throw new Error(err.detail || "Exit failed");
    }
    return res.json();
}

export async function ingestForDeal(
    roomId: string,
    files: File[]
): Promise<IngestResponse & { room: DealRoom }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const res = await fetch(`${API_BASE}/api/deal/${roomId}/ingest`, {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
    }
    return res.json();
}

export async function revealDeal(roomId: string, query: string): Promise<RevealResponse> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Reveal failed" }));
        throw new Error(err.detail || "Reveal failed");
    }
    return res.json();
}

// ── Deal Room Human Chat ────────────────────────────────────────────

export interface SendDealMessageResponse {
    session_id: string;
    agent_replied: boolean;
}

export async function sendDealHumanMessage(
    roomId: string,
    sender: string,
    role: "founder" | "investor",
    content: string
): Promise<SendDealMessageResponse> {
    const res = await fetch(`${API_BASE}/api/deal/${roomId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, role, content }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Send message failed" }));
        throw new Error(err.detail || "Send message failed");
    }
    return res.json();
}
