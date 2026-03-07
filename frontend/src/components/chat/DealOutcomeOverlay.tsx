"use client";

import { AnimatePresence, motion } from "framer-motion";

interface DealOutcomeOverlayProps {
    dealOutcome: "accepted" | "exited" | null;
    outcomeMsg: string;
    onClose: () => void;
}

export default function DealOutcomeOverlay({ dealOutcome, outcomeMsg, onClose }: DealOutcomeOverlayProps) {
    return (
        <AnimatePresence>
            {dealOutcome && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center z-50 bg-stealth-bg/80 backdrop-blur-sm"
                >
                    <div
                        className={`p-8 rounded-2xl border text-center max-w-sm ${dealOutcome === "accepted"
                                ? "bg-stealth-green/5 border-stealth-green/30"
                                : "bg-stealth-red/5 border-stealth-red/30"
                            }`}
                    >
                        <div className="text-5xl mb-4">{dealOutcome === "accepted" ? "✅" : "🔒"}</div>
                        <h2
                            className={`text-xl font-bold mb-2 ${dealOutcome === "accepted" ? "text-stealth-green" : "text-stealth-red"
                                }`}
                        >
                            {dealOutcome === "accepted" ? "Deal Sealed" : "Deal Exited"}
                        </h2>
                        <p className="text-sm text-stealth-muted">{outcomeMsg}</p>
                        <button
                            onClick={onClose}
                            className="mt-4 px-4 py-2 rounded-lg bg-stealth-surface border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
