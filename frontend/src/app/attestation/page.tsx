"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getAttestation, type AttestationResponse } from "@/lib/api";

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const cardVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring" as const, stiffness: 300, damping: 25 },
    },
};

function MetricCard({
    label,
    value,
    mono = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <motion.div
            variants={cardVariants}
            className="rounded-xl bg-stealth-surface border border-stealth-border p-4"
        >
            <p className="text-xs font-medium text-stealth-muted uppercase tracking-wider mb-1.5">
                {label}
            </p>
            <p
                className={`text-sm font-medium text-stealth-text ${mono ? "font-mono break-all" : ""
                    }`}
            >
                {value}
            </p>
        </motion.div>
    );
}

function StatusBadge({
    label,
    value,
    color,
}: {
    label: string;
    value: string;
    color: "green" | "blue" | "gold";
}) {
    const colorClasses = {
        green: "bg-stealth-green/10 text-stealth-green border-stealth-green/20",
        blue: "bg-stealth-accent/10 text-stealth-accent border-stealth-accent/20",
        gold: "bg-stealth-gold/10 text-stealth-gold border-stealth-gold/20",
    };

    return (
        <motion.div
            variants={cardVariants}
            className={`rounded-xl border p-4 ${colorClasses[color]}`}
        >
            <p className="text-xs font-medium uppercase tracking-wider opacity-70 mb-1">
                {label}
            </p>
            <p className="text-lg font-bold">{value}</p>
        </motion.div>
    );
}

export default function AttestationPage() {
    const [data, setData] = useState<AttestationResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRawQuote, setShowRawQuote] = useState(false);

    const fetchAttestation = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await getAttestation();
            setData(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAttestation();
    }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-center h-full">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="text-3xl"
                >
                    ⏳
                </motion.div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="rounded-xl bg-stealth-red/10 border border-stealth-red/20 p-6 text-center">
                    <p className="text-stealth-red font-medium">{error}</p>
                    <button
                        onClick={fetchAttestation}
                        className="mt-3 px-4 py-2 rounded-lg bg-stealth-input border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const { quote, health } = data;

    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex items-center justify-between mb-8"
            >
                <div>
                    <h2 className="text-2xl font-bold text-stealth-text">
                        🛡️ Attestation Dashboard
                    </h2>
                    <p className="text-stealth-muted text-sm mt-1">
                        TEE remote attestation — hardware-backed trust verification
                    </p>
                </div>
                <button
                    onClick={fetchAttestation}
                    className="px-4 py-2 rounded-lg bg-stealth-input border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover transition-colors"
                >
                    ↻ Refresh
                </button>
            </motion.div>

            {/* Status Badges */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
            >
                <StatusBadge
                    label="Enclave Status"
                    value={health.enclave_status}
                    color={health.enclave_status === "ACTIVE" ? "green" : "gold"}
                />
                <StatusBadge
                    label="TCB Status"
                    value={quote.tcb_status}
                    color="blue"
                />
                <StatusBadge label="TEE Type" value={quote.tee_type} color="gold" />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-stealth-surface border border-stealth-border p-4 mb-6"
            >
                <p className="text-xs text-stealth-muted uppercase tracking-wider mb-1">
                    Security Profile
                </p>
                <p className="text-sm font-semibold text-stealth-text">
                    {health.security_profile || quote.security_profile || "baseline"}
                    {health.threshold_mode ? " (Multi-TEE Threshold Mode)" : ""}
                </p>
            </motion.div>

            {/* Measurements Grid */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
            >
                <MetricCard label="MRENCLAVE" value={quote.mrenclave} mono />
                <MetricCard label="MRSIGNER" value={quote.mrsigner} mono />
                <MetricCard
                    label="Memory Encryption"
                    value={health.memory_encryption}
                />
                <MetricCard
                    label="Attestation Provider"
                    value={quote.attestation_provider}
                />
            </motion.div>

            {/* Runtime Measurements */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-xl bg-stealth-surface border border-stealth-border p-5 mb-6"
            >
                <h3 className="text-sm font-semibold text-stealth-text mb-3">
                    Runtime Measurements (RTMR)
                </h3>
                <div className="space-y-2">
                    {Object.entries(quote.runtime_measurements).map(([key, val]) => (
                        <div
                            key={key}
                            className="flex items-center gap-3 text-xs font-mono"
                        >
                            <span className="text-stealth-accent font-sans font-medium uppercase w-14">
                                {key}
                            </span>
                            <span className="text-stealth-muted break-all">{val}</span>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Confidential VM */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="rounded-xl bg-stealth-surface border border-stealth-border p-5 mb-6"
            >
                <h3 className="text-sm font-semibold text-stealth-text mb-3">
                    Confidential VM
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div>
                        <p className="text-xs text-stealth-muted">Provider</p>
                        <p className="text-sm font-medium text-stealth-text mt-0.5">
                            {health.confidential_vm.provider}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-stealth-muted">Encrypted Memory</p>
                        <p className="text-sm font-medium text-stealth-text mt-0.5">
                            {health.confidential_vm.encrypted_memory_mb} MB
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-stealth-muted">NUMA Nodes</p>
                        <p className="text-sm font-medium text-stealth-text mt-0.5">
                            {health.confidential_vm.numa_nodes}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-stealth-muted">CPU Flags</p>
                        <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                            {health.confidential_vm.cpu_flags.map((flag) => (
                                <span
                                    key={flag}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-stealth-elevated text-stealth-muted border border-stealth-border"
                                >
                                    {flag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Raw Quote Toggle */}
            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <button
                    onClick={() => setShowRawQuote(!showRawQuote)}
                    className="flex items-center gap-2 text-sm text-stealth-muted hover:text-stealth-text transition-colors mb-3"
                >
                    <motion.span
                        animate={{ rotate: showRawQuote ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        ▶
                    </motion.span>
                    Raw TDX Quote (JSON)
                </button>

                <motion.div
                    initial={false}
                    animate={{
                        height: showRawQuote ? "auto" : 0,
                        opacity: showRawQuote ? 1 : 0,
                    }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                >
                    <pre className="rounded-xl bg-stealth-surface border border-stealth-border p-4 text-xs font-mono text-stealth-muted overflow-x-auto">
                        {JSON.stringify(quote, null, 2)}
                    </pre>
                </motion.div>
            </motion.div>
        </div>
    );
}
