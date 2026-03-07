"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getAttestation, type AttestationResponse } from "@/lib/api";
import {
    containerVariants, cardVariants,
    MetricCard, StatusBadge,
    RuntimeMeasurements, ConfidentialVMSection, RawQuoteToggle,
} from "@/components/attestation/AttestationWidgets";

export default function AttestationPage() {
    const [data, setData] = useState<AttestationResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showRawQuote, setShowRawQuote] = useState(false);

    const fetchAttestation = async () => {
        try {
            setLoading(true);
            setError(null);
            setData(await getAttestation());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAttestation(); }, []);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-center h-full">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="text-3xl">
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
                    <button onClick={fetchAttestation} className="mt-3 px-4 py-2 rounded-lg bg-stealth-input border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover transition-colors">
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
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="flex items-center justify-between mb-8"
            >
                <div>
                    <h2 className="text-2xl font-bold text-stealth-text">🛡️ Attestation Dashboard</h2>
                    <p className="text-stealth-muted text-sm mt-1">TEE remote attestation — hardware-backed trust verification</p>
                </div>
                <button onClick={fetchAttestation} className="px-4 py-2 rounded-lg bg-stealth-input border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover transition-colors">
                    ↻ Refresh
                </button>
            </motion.div>

            {/* Status Badges */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <StatusBadge label="Enclave Status" value={health.enclave_status} color={health.enclave_status === "ACTIVE" ? "green" : "gold"} />
                <StatusBadge label="TCB Status" value={quote.tcb_status} color="blue" />
                <StatusBadge label="TEE Type" value={quote.tee_type} color="gold" />
            </motion.div>

            {/* Security Profile */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-stealth-surface border border-stealth-border p-4 mb-6">
                <p className="text-xs text-stealth-muted uppercase tracking-wider mb-1">Security Profile</p>
                <p className="text-sm font-semibold text-stealth-text">
                    {health.security_profile || quote.security_profile || "baseline"}
                    {health.threshold_mode ? " (Multi-TEE Threshold Mode)" : ""}
                </p>
            </motion.div>

            {/* Measurements Grid */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <MetricCard label="MRENCLAVE" value={quote.mrenclave} mono />
                <MetricCard label="MRSIGNER" value={quote.mrsigner} mono />
                <MetricCard label="Memory Encryption" value={health.memory_encryption} />
                <MetricCard label="Attestation Provider" value={quote.attestation_provider} />
            </motion.div>

            <RuntimeMeasurements measurements={quote.runtime_measurements} />
            <ConfidentialVMSection vm={health.confidential_vm} />
            <RawQuoteToggle quote={quote} show={showRawQuote} onToggle={() => setShowRawQuote((s) => !s)} />
        </div>
    );
}
