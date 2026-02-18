"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { ingestFiles } from "@/lib/api";

type UploadPhase = "idle" | "uploading" | "embedding" | "success" | "error";

const phaseConfig: Record<
    UploadPhase,
    { icon: string; label: string; color: string }
> = {
    idle: { icon: "📂", label: "Ready", color: "text-stealth-muted" },
    uploading: {
        icon: "⏳",
        label: "Processing files...",
        color: "text-stealth-accent",
    },
    embedding: {
        icon: "🧠",
        label: "Creating embeddings...",
        color: "text-stealth-accent",
    },
    success: {
        icon: "✅",
        label: "Successfully ingested!",
        color: "text-stealth-green",
    },
    error: { icon: "❌", label: "Upload failed", color: "text-stealth-red" },
};

export default function VaultPage() {
    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [result, setResult] = useState<{
        chunks: number;
        files: number;
    } | null>(null);
    const [errorMsg, setErrorMsg] = useState("");

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        try {
            setPhase("uploading");
            setErrorMsg("");

            // Simulate upload phase briefly
            await new Promise((r) => setTimeout(r, 800));
            setPhase("embedding");

            const res = await ingestFiles(acceptedFiles);

            setResult({ chunks: res.chunks_created, files: res.files_processed });
            setPhase("success");

            // Reset after 5 seconds
            setTimeout(() => {
                setPhase("idle");
                setResult(null);
            }, 5000);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Upload failed");
            setPhase("error");
            setTimeout(() => setPhase("idle"), 4000);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/pdf": [".pdf"],
            "text/plain": [".txt"],
        },
        disabled: phase === "uploading" || phase === "embedding",
    });

    const currentPhase = phaseConfig[phase];

    return (
        <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h2 className="text-2xl font-bold text-stealth-text mb-2">
                    🔒 Founder Vault
                </h2>
                <p className="text-stealth-muted text-sm leading-relaxed mb-8">
                    Upload your proprietary documents. All data is encrypted inside the
                    TEE — only the AI agent can read them under NDA constraints.
                </p>
            </motion.div>

            {/* Upload Zone */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
            >
                <div
                    {...getRootProps()}
                    className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer
            ${isDragActive
                            ? "border-stealth-accent bg-stealth-accent/5 shadow-[0_0_30px_rgba(138,180,248,0.1)]"
                            : "border-stealth-border bg-stealth-surface hover:border-stealth-muted hover:bg-stealth-elevated"
                        }
            ${phase === "uploading" || phase === "embedding"
                            ? "pointer-events-none opacity-60"
                            : ""
                        }
          `}
                >
                    <input {...getInputProps()} />

                    <div className="flex flex-col items-center justify-center py-16 px-6">
                        <motion.div
                            animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="text-4xl mb-4"
                        >
                            {isDragActive ? "📥" : "📄"}
                        </motion.div>

                        <p className="text-stealth-text font-medium mb-1">
                            {isDragActive
                                ? "Drop files here..."
                                : "Drag & drop files, or click to browse"}
                        </p>
                        <p className="text-stealth-muted text-xs">
                            PDF and TXT files · Encrypted at rest inside TEE
                        </p>
                    </div>
                </div>
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
                                animate={
                                    phase === "uploading" || phase === "embedding"
                                        ? { rotate: 360 }
                                        : {}
                                }
                                transition={
                                    phase === "uploading" || phase === "embedding"
                                        ? { repeat: Infinity, duration: 2, ease: "linear" }
                                        : {}
                                }
                                className="text-2xl"
                            >
                                {currentPhase.icon}
                            </motion.span>

                            <div>
                                <p className={`font-semibold ${currentPhase.color}`}>
                                    {currentPhase.label}
                                </p>
                                {phase === "success" && result && (
                                    <p className="text-xs text-stealth-muted mt-0.5">
                                        {result.files} file(s) → {result.chunks} chunks embedded
                                    </p>
                                )}
                                {phase === "error" && (
                                    <p className="text-xs text-stealth-red mt-0.5">{errorMsg}</p>
                                )}
                            </div>
                        </div>

                        {/* Progress bar for uploading/embedding */}
                        {(phase === "uploading" || phase === "embedding") && (
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
                    {
                        icon: "🔐",
                        title: "Encrypted Storage",
                        desc: "AES-256-XTS memory encryption",
                    },
                    {
                        icon: "🧠",
                        title: "AI Embedding",
                        desc: "Gemini Embedding 001 vectors",
                    },
                    {
                        icon: "📜",
                        title: "NDA Enforced",
                        desc: "No raw IP disclosure allowed",
                    },
                ].map((card, i) => (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 + i * 0.1 }}
                        className="rounded-xl bg-stealth-surface border border-stealth-border p-4 text-center"
                    >
                        <div className="text-2xl mb-2">{card.icon}</div>
                        <p className="text-sm font-medium text-stealth-text">
                            {card.title}
                        </p>
                        <p className="text-xs text-stealth-muted mt-0.5">{card.desc}</p>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
}
