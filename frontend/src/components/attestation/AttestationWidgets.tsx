"use client";

import { motion } from "framer-motion";
import { AttestationResponse } from "@/lib/api";

// ── Animation variants ────────────────────────────────────────────────

export const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export const cardVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 25 } },
};

// ── MetricCard ────────────────────────────────────────────────────────

export function MetricCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <motion.div variants={cardVariants} className="rounded-xl bg-stealth-surface border border-stealth-border p-4">
            <p className="text-xs font-medium text-stealth-muted uppercase tracking-wider mb-1.5">{label}</p>
            <p className={`text-sm font-medium text-stealth-text ${mono ? "font-mono break-all" : ""}`}>{value}</p>
        </motion.div>
    );
}

// ── StatusBadge ───────────────────────────────────────────────────────

const COLOR_CLASSES = {
    green: "bg-stealth-green/10 text-stealth-green border-stealth-green/20",
    blue: "bg-stealth-accent/10 text-stealth-accent border-stealth-accent/20",
    gold: "bg-stealth-gold/10 text-stealth-gold border-stealth-gold/20",
};

export function StatusBadge({ label, value, color }: { label: string; value: string; color: "green" | "blue" | "gold" }) {
    return (
        <motion.div variants={cardVariants} className={`rounded-xl border p-4 ${COLOR_CLASSES[color]}`}>
            <p className="text-xs font-medium uppercase tracking-wider opacity-70 mb-1">{label}</p>
            <p className="text-lg font-bold">{value}</p>
        </motion.div>
    );
}

// ── RuntimeMeasurements ───────────────────────────────────────────────

export function RuntimeMeasurements({ measurements }: { measurements: Record<string, string> }) {
    return (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-xl bg-stealth-surface border border-stealth-border p-5 mb-6"
        >
            <h3 className="text-sm font-semibold text-stealth-text mb-3">Runtime Measurements (RTMR)</h3>
            <div className="space-y-2">
                {Object.entries(measurements).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-stealth-accent font-sans font-medium uppercase w-14">{key}</span>
                        <span className="text-stealth-muted break-all">{val}</span>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

// ── ConfidentialVM ────────────────────────────────────────────────────

export function ConfidentialVMSection({ vm }: { vm: AttestationResponse["health"]["confidential_vm"] }) {
    return (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-xl bg-stealth-surface border border-stealth-border p-5 mb-6"
        >
            <h3 className="text-sm font-semibold text-stealth-text mb-3">Confidential VM</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                    <p className="text-xs text-stealth-muted">Provider</p>
                    <p className="text-sm font-medium text-stealth-text mt-0.5">{vm.provider}</p>
                </div>
                <div>
                    <p className="text-xs text-stealth-muted">Encrypted Memory</p>
                    <p className="text-sm font-medium text-stealth-text mt-0.5">{vm.encrypted_memory_mb} MB</p>
                </div>
                <div>
                    <p className="text-xs text-stealth-muted">NUMA Nodes</p>
                    <p className="text-sm font-medium text-stealth-text mt-0.5">{vm.numa_nodes}</p>
                </div>
                <div>
                    <p className="text-xs text-stealth-muted">CPU Flags</p>
                    <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                        {vm.cpu_flags.map((flag) => (
                            <span key={flag} className="px-1.5 py-0.5 rounded text-[10px] bg-stealth-elevated text-stealth-muted border border-stealth-border">
                                {flag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ── RawQuoteToggle ────────────────────────────────────────────────────

export function RawQuoteToggle({ quote, show, onToggle }: {
    quote: AttestationResponse["quote"];
    show: boolean;
    onToggle: () => void;
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <button onClick={onToggle} className="flex items-center gap-2 text-sm text-stealth-muted hover:text-stealth-text transition-colors mb-3">
                <motion.span animate={{ rotate: show ? 90 : 0 }} transition={{ duration: 0.2 }}>▶</motion.span>
                Raw TDX Quote (JSON)
            </button>
            <motion.div
                initial={false}
                animate={{ height: show ? "auto" : 0, opacity: show ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
            >
                <pre className="rounded-xl bg-stealth-surface border border-stealth-border p-4 text-xs font-mono text-stealth-muted overflow-x-auto">
                    {JSON.stringify(quote, null, 2)}
                </pre>
            </motion.div>
        </motion.div>
    );
}
