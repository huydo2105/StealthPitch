"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { ingestForDeal, listWalletDeals, DealRoom } from "@/lib/api";
import { useAccount } from "wagmi";

type UploadPhase = "idle" | "uploading" | "embedding" | "success" | "error";

const phaseConfig: Record<UploadPhase, { icon: string; label: string; color: string }> = {
    idle: { icon: "📂", label: "Ready", color: "text-stealth-muted" },
    uploading: { icon: "⏳", label: "Uploading files...", color: "text-stealth-accent" },
    embedding: { icon: "🧠", label: "Creating embeddings...", color: "text-stealth-accent" },
    success: { icon: "✅", label: "Successfully ingested!", color: "text-stealth-green" },
    error: { icon: "❌", label: "Upload failed", color: "text-stealth-red" },
};

export default function VaultPage() {
    const { address: walletAddress } = useAccount();

    // Room targeting
    const [roomIdInput, setRoomIdInput] = useState("");
    const [rooms, setRooms] = useState<DealRoom[]>([]);
    const [roomsLoaded, setRoomsLoaded] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState<DealRoom | null>(null);
    const [loadingRooms, setLoadingRooms] = useState(false);

    // Upload
    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [result, setResult] = useState<{ chunks: number; files: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState("");
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    // Load all deal rooms for the connected wallet
    const loadRooms = async () => {
        if (!walletAddress) return;
        setLoadingRooms(true);
        try {
            const data = await listWalletDeals(walletAddress);
            setRooms(data);
            setRoomsLoaded(true);
        } catch {
            setRooms([]);
            setRoomsLoaded(true);
        } finally {
            setLoadingRooms(false);
        }
    };

    const handleSelectRoom = (room: DealRoom) => {
        setSelectedRoom(room);
        setRoomIdInput(room.room_id);
        setPhase("idle");
        setResult(null);
    };

    const doUpload = useCallback(
        async (files: File[]) => {
            const roomId = roomIdInput.trim();
            if (!roomId || files.length === 0) return;

            try {
                setPhase("uploading");
                setErrorMsg("");
                await new Promise((r) => setTimeout(r, 600));
                setPhase("embedding");

                const res = await ingestForDeal(roomId, files);
                setResult({ chunks: res.chunks_created, files: res.files_processed });
                setPhase("success");

                setTimeout(() => {
                    setPhase("idle");
                    setResult(null);
                    setPendingFiles([]);
                }, 5000);
            } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : "Upload failed");
                setPhase("error");
                setTimeout(() => setPhase("idle"), 4000);
            }
        },
        [roomIdInput]
    );

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (acceptedFiles.length === 0) return;
            setPendingFiles(acceptedFiles);
            const roomId = roomIdInput.trim();
            if (!roomId) {
                // Show files but wait for room selection
                return;
            }
            await doUpload(acceptedFiles);
        },
        [roomIdInput, doUpload]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/pdf": [".pdf"],
            "text/plain": [".txt"],
        },
        disabled: phase === "uploading" || phase === "embedding",
    });

    const currentPhase = phaseConfig[phase];
    const isProcessing = phase === "uploading" || phase === "embedding";
    const roomId = roomIdInput.trim();

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h2 className="text-2xl font-bold text-stealth-text mb-2">🔒 Founder Vault</h2>
                <p className="text-stealth-muted text-sm leading-relaxed mb-8">
                    Upload proprietary documents to a specific deal room. The TEE agent will only
                    retrieve documents for that room — fully isolated per deal.
                </p>
            </motion.div>

            {/* Room Selector */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="mb-6 rounded-xl bg-stealth-surface border border-stealth-border p-5"
            >
                <p className="text-xs font-semibold uppercase tracking-wide text-stealth-muted mb-3">
                    🎯 Target Deal Room
                </p>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={roomIdInput}
                        onChange={(e) => {
                            setRoomIdInput(e.target.value);
                            setSelectedRoom(null);
                        }}
                        placeholder="Paste a room ID, or pick from your deals ↓"
                        className="flex-1 px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                    />
                    {walletAddress && (
                        <button
                            onClick={loadRooms}
                            disabled={loadingRooms}
                            className="px-4 py-2 rounded-lg bg-stealth-surface border border-stealth-border text-xs text-stealth-muted hover:text-stealth-text hover:border-stealth-accent/40 transition-colors disabled:opacity-40"
                        >
                            {loadingRooms ? "Loading…" : "My Deals"}
                        </button>
                    )}
                </div>

                {/* Room list */}
                <AnimatePresence>
                    {roomsLoaded && rooms.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 flex flex-col gap-1.5 overflow-hidden"
                        >
                            {rooms.map((r) => (
                                <button
                                    key={r.room_id}
                                    onClick={() => handleSelectRoom(r)}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${selectedRoom?.room_id === r.room_id
                                            ? "border-stealth-accent/40 bg-stealth-accent/5 text-stealth-accent"
                                            : "border-stealth-border bg-stealth-hover text-stealth-muted hover:text-stealth-text hover:border-stealth-accent/30"
                                        }`}
                                >
                                    <span className="font-mono text-[11px] truncate max-w-[160px] shrink-0">{r.room_id}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${r.status === "accepted"
                                            ? "bg-stealth-green/10 text-stealth-green"
                                            : r.status === "funded" || r.status === "negotiating"
                                                ? "bg-stealth-accent/10 text-stealth-accent"
                                                : "bg-stealth-gold/10 text-stealth-gold"
                                        }`}>
                                        {r.status}
                                    </span>
                                    <span className="ml-auto shrink-0">{r.documents_ingested ? "📚 docs" : "📭 no docs"}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                    {roomsLoaded && rooms.length === 0 && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-3 text-xs text-stealth-muted"
                        >
                            No deal rooms found for your wallet.
                        </motion.p>
                    )}
                </AnimatePresence>

                {roomId && (
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-3 text-[11px] text-stealth-green font-mono"
                    >
                        ✓ Uploading to: <span className="font-bold">{roomId}</span>
                    </motion.p>
                )}
            </motion.div>

            {/* Upload Zone */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
                <div
                    {...getRootProps()}
                    className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
                        ${isDragActive
                            ? "border-stealth-accent bg-stealth-accent/5 shadow-[0_0_30px_rgba(138,180,248,0.1)]"
                            : roomId
                                ? "border-stealth-border bg-stealth-surface hover:border-stealth-muted hover:bg-stealth-elevated"
                                : "border-stealth-border/50 bg-stealth-surface/50 opacity-60 cursor-not-allowed"
                        }
                        ${isProcessing ? "pointer-events-none opacity-60" : ""}
                    `}
                >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                        <motion.div
                            animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="text-4xl mb-4"
                        >
                            {isDragActive ? "📥" : roomId ? "📄" : "🔒"}
                        </motion.div>
                        <p className="text-stealth-text font-medium mb-1">
                            {!roomId
                                ? "Select a deal room first"
                                : isDragActive
                                    ? "Drop files here..."
                                    : "Drag & drop or click to browse"}
                        </p>
                        <p className="text-stealth-muted text-xs">PDF and TXT files · Indexed only for this deal room</p>

                        {/* Pending files preview */}
                        {pendingFiles.length > 0 && !isProcessing && phase === "idle" && (
                            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
                                {pendingFiles.map((f, i) => (
                                    <span
                                        key={i}
                                        className="text-[10px] px-2 py-1 rounded-full bg-stealth-hover border border-stealth-border text-stealth-muted"
                                    >
                                        📄 {f.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Upload button when files staged and room set */}
                <AnimatePresence>
                    {pendingFiles.length > 0 && roomId && phase === "idle" && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-3 flex justify-end"
                        >
                            <button
                                onClick={() => doUpload(pendingFiles)}
                                className="px-5 py-2.5 rounded-xl bg-stealth-accent text-stealth-bg text-sm font-semibold hover:bg-stealth-accent/90 transition-colors"
                            >
                                Upload {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} → Room {roomId.slice(0, 8)}…
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Status Card */}
            <AnimatePresence mode="wait">
                {phase !== "idle" && (
                    <motion.div
                        key={phase}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.3 }}
                        className="mt-6 rounded-xl bg-stealth-surface border border-stealth-border p-5"
                    >
                        <div className="flex items-center gap-3">
                            <motion.span
                                animate={isProcessing ? { rotate: 360 } : {}}
                                transition={isProcessing ? { repeat: Infinity, duration: 2, ease: "linear" } : {}}
                                className="text-2xl"
                            >
                                {currentPhase.icon}
                            </motion.span>
                            <div>
                                <p className={`font-semibold ${currentPhase.color}`}>{currentPhase.label}</p>
                                {phase === "success" && result && (
                                    <p className="text-xs text-stealth-muted mt-0.5">
                                        {result.files} file(s) → {result.chunks} chunks embedded into room{" "}
                                        <span className="font-mono text-stealth-accent">{roomIdInput.slice(0, 12)}…</span>
                                    </p>
                                )}
                                {phase === "error" && (
                                    <p className="text-xs text-stealth-red mt-0.5">{errorMsg}</p>
                                )}
                            </div>
                        </div>
                        {isProcessing && (
                            <div className="mt-3 h-1 rounded-full bg-stealth-border overflow-hidden">
                                <motion.div
                                    className="h-full bg-stealth-accent rounded-full"
                                    initial={{ width: phase === "uploading" ? "0%" : "50%" }}
                                    animate={{ width: phase === "uploading" ? "50%" : "90%" }}
                                    transition={{ duration: 2, ease: "easeInOut" }}
                                />
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Info Cards */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
                {[
                    { icon: "🔐", title: "Room-Isolated", desc: "Each deal room has its own document index" },
                    { icon: "🧠", title: "AI Embedding", desc: "Gemini Embedding 001 vectors" },
                    { icon: "📜", title: "NDA Enforced", desc: "No raw IP disclosure allowed" },
                ].map((card, i) => (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                        className="rounded-xl bg-stealth-surface border border-stealth-border p-4 text-center"
                    >
                        <div className="text-2xl mb-2">{card.icon}</div>
                        <p className="text-sm font-medium text-stealth-text">{card.title}</p>
                        <p className="text-xs text-stealth-muted mt-0.5">{card.desc}</p>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
}
