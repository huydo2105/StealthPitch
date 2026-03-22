"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { DealRoom } from "@/lib/api";
import { TxBadge } from "@/components/deal/TxBadge";
import { OnChainPanel } from "@/components/deal/OnChainPanel";

// ── Shared ────────────────────────────────────────────────────────────

interface RoomGridProps { room: DealRoom; }

function RoomGrid({ room }: RoomGridProps) {
    return (
        <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
                <span className="text-stealth-muted">Room ID</span>
                <div className="font-mono text-stealth-accent text-lg">{room.room_id}</div>
            </div>
            <div>
                <span className="text-stealth-muted">Threshold</span>
                <div className="text-stealth-text">{room.seller_threshold} XTZ</div>
            </div>
            <div>
                <span className="text-stealth-muted">Status</span>
                <div className="text-stealth-gold uppercase tracking-wide">{room.status}</div>
            </div>
            <div>
                <span className="text-stealth-muted">Documents</span>
                <div className="text-stealth-text">{room.documents_ingested ? "✅ Loaded" : "⏳ Pending"}</div>
            </div>
        </div>
    );
}

// ── Founder: Created panel ────────────────────────────────────────────

interface CreatedPanelProps {
    room: DealRoom;
    createTxHash: `0x${string}` | undefined;
    isCreateConfirming: boolean;
    isCreateConfirmed: boolean;
    onChainError: string | null;
    getRootProps: ReturnType<typeof import("react-dropzone").useDropzone>["getRootProps"];
    getInputProps: ReturnType<typeof import("react-dropzone").useDropzone>["getInputProps"];
    isDragActive: boolean;
    uploadPhase: "idle" | "uploading" | "done";
    uploadMsg: string;
    onRefresh: () => void;
}

export function CreatedPanel({
    room, createTxHash, isCreateConfirming, isCreateConfirmed, onChainError,
    getRootProps, getInputProps, isDragActive, uploadPhase, uploadMsg, onRefresh,
}: CreatedPanelProps) {
    const router = useRouter();

    return (
        <motion.div key="created" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="p-5 rounded-xl bg-stealth-green/5 border border-stealth-green/20 space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-stealth-green animate-pulse" />
                    <h2 className="text-sm font-semibold text-stealth-green">Deal Room Created</h2>
                </div>
                <RoomGrid room={room} />
                <TxBadge txHash={createTxHash} isConfirming={isCreateConfirming} isConfirmed={isCreateConfirmed} label="Deal registered" />
                {onChainError && <p className="text-xs text-stealth-red">⚠ On-chain: {onChainError.slice(0, 120)}</p>}
                <p className="text-xs text-stealth-muted mt-2">
                    Share Room ID <strong className="text-stealth-accent">{room.room_id}</strong> with your investor.
                </p>
            </div>

            {/* File Upload */}
            {!room.documents_ingested && (
                <div
                    {...getRootProps()}
                    className={`p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${isDragActive ? "border-stealth-accent/50 bg-stealth-accent/5" : "border-stealth-border hover:border-stealth-accent/30"
                        }`}
                >
                    <input {...getInputProps()} />
                    {uploadPhase === "uploading" ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
                            <p className="text-sm text-stealth-muted">Encrypting & embedding...</p>
                        </div>
                    ) : uploadPhase === "done" ? (
                        <div className="text-sm text-stealth-green">{uploadMsg}</div>
                    ) : (
                        <div className="space-y-1">
                            <p className="text-sm text-stealth-text">📄 Drop documents here or click to upload</p>
                            <p className="text-xs text-stealth-muted">PDF, TXT — encrypted within TEE</p>
                        </div>
                    )}
                </div>
            )}

            {room.documents_ingested && (
                <button
                    onClick={() => router.push(`/chat?session=${room.session_id}&deal=${room.room_id}`)}
                    className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                >
                    Open Negotiation Chat →
                </button>
            )}

            <button onClick={onRefresh} className="text-xs text-stealth-muted hover:text-stealth-accent">
                ↻ Refresh status
            </button>
        </motion.div>
    );
}

// ── Investor: Joined panel ────────────────────────────────────────────

interface JoinedPanelProps {
    room: DealRoom;
    depositTxHash: `0x${string}` | undefined;
    isDepositConfirming: boolean;
    isDepositConfirmed: boolean;
    onChainError: string | null;
    onRefresh: () => void;
    setPhase: (p: "setup" | "creating" | "created" | "joining" | "joined" | "error") => void;
}

export function JoinedPanel({
    room, depositTxHash, isDepositConfirming, isDepositConfirmed, onChainError, onRefresh, setPhase,
}: JoinedPanelProps) {
    const router = useRouter();

    const isFunded = room.status === "funded" || room.status === "negotiating";

    return (
        <motion.div key="joined" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="p-5 rounded-xl bg-stealth-accent/5 border border-stealth-accent/20 space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-stealth-accent animate-pulse" />
                    <h2 className="text-sm font-semibold text-stealth-accent">Joined Deal Room</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <span className="text-stealth-muted">Room ID</span>
                        <div className="font-mono text-stealth-accent">{room.room_id}</div>
                    </div>
                    <div>
                        <span className="text-stealth-muted">Your Budget</span>
                        <div className="text-stealth-text">{room.buyer_budget} XTZ</div>
                    </div>
                    <div>
                        <span className="text-stealth-muted">Status</span>
                        <div className="text-stealth-gold uppercase tracking-wide">{room.status}</div>
                    </div>
                    <div>
                        <span className="text-stealth-muted">Documents</span>
                        <div className="text-stealth-text">
                            {room.documents_ingested ? "✅ Ready" : "⏳ Pending"}
                        </div>
                    </div>
                </div>
                <TxBadge txHash={depositTxHash} isConfirming={isDepositConfirming} isConfirmed={isDepositConfirmed} label="Funds deposited to escrow" />
                {onChainError && <p className="text-xs text-stealth-red">⚠ On-chain: {onChainError.slice(0, 120)}</p>}
            </div>

            {isFunded ? (
                room.documents_ingested ? (
                    <button
                        onClick={() => router.push(`/chat?session=${room.session_id}&deal=${room.room_id}`)}
                        className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                    >
                        Start Negotiation →
                    </button>
                ) : (
                    <div className="p-3 rounded-lg bg-stealth-surface border border-stealth-border text-center">
                        <p className="text-xs text-stealth-text">Deposit confirmed! ✅</p>
                        <p className="text-[10px] text-stealth-muted mt-1">Waiting for founder to upload documents...</p>
                    </div>
                )
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-stealth-muted text-center">
                        {isDepositConfirming ? "Confirming your on-chain deposit..." : "Awaiting on-chain confirmation..."}
                    </p>
                    {!isDepositConfirmed && (
                        <button
                            onClick={() => setPhase("setup")}
                            className="w-full py-2 rounded-lg bg-stealth-surface border border-stealth-border text-stealth-text text-xs hover:bg-stealth-border/20 transition-colors"
                        >
                            ← Back to Setup (Retry Deposit)
                        </button>
                    )}
                </div>
            )}

            <button onClick={onRefresh} className="text-xs text-stealth-muted hover:text-stealth-accent w-full text-center">
                ↻ Refresh Status
            </button>
        </motion.div>
    );
}

// ── Settled state panels (Accepted / Exited) ─────────────────────────

interface SettledPanelProps { room: DealRoom; }

export function AcceptedPanel({ room }: SettledPanelProps) {
    const router = useRouter();
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl bg-stealth-green/5 border border-stealth-green/20 space-y-2">
            <p className="text-sm font-semibold text-stealth-green">✅ Disclosure Unlocked</p>
            <p className="text-xs text-stealth-muted">Deal accepted: funds settled on-chain. Raw disclosure access is now enabled.</p>
            <div className="border-t border-stealth-border/50 pt-2">
                <OnChainPanel roomId={room.room_id} />
            </div>
            <button
                onClick={() => router.push(`/chat?session=${room.session_id}&deal=${room.room_id}`)}
                className="mt-1 w-full py-2 rounded-lg bg-stealth-green/10 border border-stealth-green/30 text-stealth-green text-sm font-semibold hover:bg-stealth-green/20 transition-colors"
            >
                Open Chat and Reveal IP
            </button>
        </motion.div>
    );
}

export function ExitedPanel({ room }: SettledPanelProps) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl bg-stealth-red/5 border border-stealth-red/20 space-y-2">
            <p className="text-sm font-semibold text-stealth-red">🚫 Deal Exited — Investor Refunded</p>
            <p className="text-xs text-stealth-muted">Negotiation failed. Funds have been returned to the investor on-chain.</p>
            <div className="border-t border-stealth-border/50 pt-2">
                <OnChainPanel roomId={room.room_id} />
            </div>
        </motion.div>
    );
}

// ── Tx History panel ──────────────────────────────────────────────────

export function TxHistoryPanel({ room }: SettledPanelProps) {
    if (!room.tx_history.length) return null;
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl bg-stealth-surface border border-stealth-border space-y-2">
            <h3 className="text-xs font-semibold text-stealth-muted uppercase tracking-wide">Blockchain Transactions</h3>
            {room.tx_history.map((tx, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-stealth-accent">●</span>
                    <span className="text-stealth-text font-mono">{tx.action}</span>
                    <span className="text-stealth-muted">{tx.result.status === "simulated" ? "(simulated)" : ""}</span>
                    {Boolean(tx.result.explorer_link) && (
                        <a href={tx.result.explorer_link as string} target="_blank" rel="noopener noreferrer" className="text-stealth-accent hover:underline ml-auto">
                            View on Explorer ↗
                        </a>
                    )}
                </div>
            ))}
        </motion.div>
    );
}
