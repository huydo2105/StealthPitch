/**
 * StealthPitch — API Client
 * Typed fetch helpers for the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────

export interface HealthResponse {
    status: string;
    has_documents: boolean;
    version: string;
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
        confidential_vm: {
            provider: string;
            cpu_flags: string[];
            numa_nodes: number;
            encrypted_memory_mb: number;
        };
    };
}

// ── API Functions ───────────────────────────────────────────────────

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

export async function sendChat(
    query: string,
    sessionId?: string
): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, session_id: sessionId }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Chat failed" }));
        throw new Error(err.detail || "Chat failed");
    }
    return res.json();
}

export function streamChat(
    query: string,
    sessionId: string | undefined,
    onChunk: (chunk: string) => void,
    onDone: (sessionId: string, sources: string[]) => void,
    onError: (error: string) => void
): AbortController {
    const controller = new AbortController();

    fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, session_id: sessionId }),
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
                                onDone(data.session_id, data.sources || []);
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

export async function getAttestation(): Promise<AttestationResponse> {
    const res = await fetch(`${API_BASE}/api/attestation`);
    if (!res.ok) throw new Error("Attestation fetch failed");
    return res.json();
}
