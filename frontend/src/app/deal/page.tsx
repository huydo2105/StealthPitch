"use client";

import { useState, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
    createDeal,
    joinDeal,
    getDeal,
    ingestForDeal,
    DealRoom,
} from "@/lib/api";

type Phase = "setup" | "creating" | "created" | "joining" | "joined" | "error";

function DealRoomContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialRole = searchParams.get("role") || "founder";

    const [role, setRole] = useState<"founder" | "investor">(
        initialRole as "founder" | "investor"
    );
    const [phase, setPhase] = useState<Phase>("setup");
    const [error, setError] = useState("");
    const [room, setRoom] = useState<DealRoom | null>(null);

    // Founder fields
    const [sellerAddress, setSellerAddress] = useState("");
    const [threshold, setThreshold] = useState("");

    // Investor fields
    const [roomIdInput, setRoomIdInput] = useState("");
    const [buyerAddress, setBuyerAddress] = useState("");
    const [budget, setBudget] = useState("");

    // File upload
    const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "done">("idle");
    const [uploadMsg, setUploadMsg] = useState("");

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (!room) return;
            setUploadPhase("uploading");
            try {
                const res = await ingestForDeal(room.room_id, acceptedFiles);
                setUploadMsg(`${res.files_processed} file(s) → ${res.chunks_created} chunks`);
                setRoom(res.room);
                setUploadPhase("done");
            } catch (err: unknown) {
                setUploadMsg(err instanceof Error ? err.message : "Upload failed");
                setUploadPhase("idle");
            }
        },
        [room]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/pdf": [".pdf"],
            "text/plain": [".txt"],
        },
    });

    const handleCreateDeal = async () => {
        if (!sellerAddress || !threshold) {
            setError("Please fill in all fields");
            return;
        }
        setPhase("creating");
        setError("");
        try {
            const deal = await createDeal(sellerAddress, parseFloat(threshold));
            setRoom(deal);
            setPhase("created");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to create deal");
            setPhase("error");
        }
    };

    const handleJoinDeal = async () => {
        if (!roomIdInput || !buyerAddress || !budget) {
            setError("Please fill in all fields");
            return;
        }
        setPhase("joining");
        setError("");
        try {
            const deal = await joinDeal(roomIdInput, buyerAddress, parseFloat(budget));
            setRoom(deal);
            setPhase("joined");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to join deal");
            setPhase("error");
        }
    };

    const refreshRoom = async () => {
        if (!room) return;
        try {
            const updated = await getDeal(room.room_id);
            setRoom(updated);
        } catch {
            // Silently fail
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
            >
                <h1 className="text-2xl font-bold text-stealth-bright">🤝 Deal Room</h1>
                <p className="text-sm text-stealth-muted">
                    NDAI Protocol — Secure invention disclosure with smart contract settlement
                </p>
            </motion.div>

            {/* Role Toggle */}
            <div className="flex gap-2 p-1 bg-stealth-surface rounded-lg border border-stealth-border w-fit">
                <button
                    onClick={() => { setRole("founder"); setPhase("setup"); setError(""); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${role === "founder"
                        ? "bg-stealth-accent text-stealth-bg"
                        : "text-stealth-muted hover:text-stealth-text"
                        }`}
                >
                    🚀 Founder
                </button>
                <button
                    onClick={() => { setRole("investor"); setPhase("setup"); setError(""); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${role === "investor"
                        ? "bg-stealth-accent text-stealth-bg"
                        : "text-stealth-muted hover:text-stealth-text"
                        }`}
                >
                    💼 Investor
                </button>
            </div>

            <AnimatePresence mode="wait">
                {/* ── SETUP PHASE ── */}
                {(phase === "setup" || phase === "error") && (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-4"
                    >
                        {role === "founder" ? (
                            <div className="p-5 rounded-xl bg-stealth-surface border border-stealth-border space-y-4">
                                <h2 className="text-sm font-semibold text-stealth-text">Create Deal Room</h2>
                                <p className="text-xs text-stealth-muted">
                                    Set your acceptance threshold — the minimum price you&apos;ll accept for disclosing your IP.
                                </p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-stealth-muted block mb-1">Wallet Address</label>
                                        <input
                                            type="text"
                                            placeholder="0x..."
                                            value={sellerAddress}
                                            onChange={(e) => setSellerAddress(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-stealth-muted block mb-1">
                                            Acceptance Threshold (XTZ) — minimum acceptable price
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="e.g. 5.0"
                                            value={threshold}
                                            onChange={(e) => setThreshold(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleCreateDeal}
                                    className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                                >
                                    Create Deal Room
                                </button>
                            </div>
                        ) : (
                            <div className="p-5 rounded-xl bg-stealth-surface border border-stealth-border space-y-4">
                                <h2 className="text-sm font-semibold text-stealth-text">Join Deal Room</h2>
                                <p className="text-xs text-stealth-muted">
                                    Enter the deal room ID and set your budget cap — the maximum you&apos;ll pay for the invention.
                                </p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-stealth-muted block mb-1">Deal Room ID</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. a1b2c3d4"
                                            value={roomIdInput}
                                            onChange={(e) => setRoomIdInput(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-stealth-muted block mb-1">Wallet Address</label>
                                        <input
                                            type="text"
                                            placeholder="0x..."
                                            value={buyerAddress}
                                            onChange={(e) => setBuyerAddress(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-stealth-muted block mb-1">
                                            Budget Cap (XTZ) — maximum you&apos;ll pay
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="e.g. 10.0"
                                            value={budget}
                                            onChange={(e) => setBudget(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={handleJoinDeal}
                                    className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                                >
                                    Join & Deposit to Escrow
                                </button>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 rounded-lg bg-stealth-red/10 border border-stealth-red/20 text-sm text-stealth-red">
                                {error}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── CREATING / JOINING PHASE ── */}
                {(phase === "creating" || phase === "joining") && (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-3 py-12"
                    >
                        <div className="w-10 h-10 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
                        <p className="text-sm text-stealth-muted">
                            {phase === "creating" ? "Creating deal on Etherlink..." : "Joining deal room..."}
                        </p>
                    </motion.div>
                )}

                {/* ── CREATED PHASE (FOUNDER) ── */}
                {phase === "created" && room && (
                    <motion.div
                        key="created"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <div className="p-5 rounded-xl bg-stealth-green/5 border border-stealth-green/20 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-stealth-green animate-pulse" />
                                <h2 className="text-sm font-semibold text-stealth-green">Deal Room Created</h2>
                            </div>
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
                            <p className="text-xs text-stealth-muted mt-2">
                                Share the Room ID <strong className="text-stealth-accent">{room.room_id}</strong> with your investor.
                            </p>
                        </div>

                        {/* File Upload */}
                        {!room.documents_ingested && (
                            <div
                                {...getRootProps()}
                                className={`p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${isDragActive
                                    ? "border-stealth-accent/50 bg-stealth-accent/5"
                                    : "border-stealth-border hover:border-stealth-accent/30"
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
                                onClick={() => router.push(`/chat?deal=${room.room_id}`)}
                                className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                            >
                                Open Negotiation Chat →
                            </button>
                        )}

                        <button onClick={refreshRoom} className="text-xs text-stealth-muted hover:text-stealth-accent">
                            ↻ Refresh status
                        </button>
                    </motion.div>
                )}

                {/* ── JOINED PHASE (INVESTOR) ── */}
                {phase === "joined" && room && (
                    <motion.div
                        key="joined"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
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
                                    <div className="text-stealth-text">{room.documents_ingested ? "✅ Available" : "⏳ Waiting..."}</div>
                                </div>
                            </div>
                        </div>

                        {room.documents_ingested ? (
                            <button
                                onClick={() => router.push(`/chat?deal=${room.room_id}`)}
                                className="w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors"
                            >
                                Start Negotiation →
                            </button>
                        ) : (
                            <p className="text-xs text-stealth-muted text-center">
                                Waiting for founder to upload documents...
                            </p>
                        )}

                        <button onClick={refreshRoom} className="text-xs text-stealth-muted hover:text-stealth-accent">
                            ↻ Refresh status
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tx History */}
            {room && room.tx_history.length > 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-xl bg-stealth-surface border border-stealth-border space-y-2"
                >
                    <h3 className="text-xs font-semibold text-stealth-muted uppercase tracking-wide">
                        Blockchain Transactions
                    </h3>
                    {room.tx_history.map((tx, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-stealth-accent">●</span>
                            <span className="text-stealth-text font-mono">{tx.action}</span>
                            <span className="text-stealth-muted">
                                {tx.result.status === "simulated" ? "(simulated)" : ""}
                            </span>
                            {Boolean(tx.result.explorer_link) && (
                                <a
                                    href={tx.result.explorer_link as string}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-stealth-accent hover:underline ml-auto"
                                >
                                    View on Explorer ↗
                                </a>
                            )}
                        </div>
                    ))}
                </motion.div>
            )}
        </div>
    );
}

export default function DealPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
                </div>
            }
        >
            <DealRoomContent />
        </Suspense>
    );
}
