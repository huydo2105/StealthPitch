"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChatMessage } from "@/types/chat";

const ROLE_STYLES: Record<string, { bg: string; label: string; labelColor: string }> = {
    user: { bg: "bg-stealth-accent/10 border-stealth-accent/20", label: "You", labelColor: "text-stealth-accent" },
    founder: { bg: "bg-stealth-accent/15 border border-stealth-accent/30", label: "🚀 Founder", labelColor: "text-stealth-accent" },
    investor: { bg: "bg-stealth-surface border border-stealth-border", label: "💼 Investor", labelColor: "text-stealth-muted" },
    buyer_agent: { bg: "bg-blue-500/5 border border-blue-500/20", label: "🤖 Buyer's Agent (AB)", labelColor: "text-blue-400" },
    seller_agent: { bg: "bg-emerald-500/5 border border-emerald-500/20", label: "🤖 Seller's Agent (AS)", labelColor: "text-emerald-400" },
    system: { bg: "bg-stealth-gold/5 border border-stealth-gold/20", label: "System", labelColor: "text-stealth-gold" },
};

interface ChatMessageListProps {
    messages: ChatMessage[];
    room: { room_id: string } | null;
    bottomRef: React.RefObject<HTMLDivElement | null>;
}

export default function ChatMessageList({ messages, room, bottomRef }: ChatMessageListProps) {
    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <span className="text-4xl">{room ? "🤝" : "💬"}</span>
                    <h2 className="text-lg font-semibold text-stealth-text">
                        {room ? "NDAI Negotiation" : "Investor Chat"}
                    </h2>
                    <p className="text-sm text-stealth-muted max-w-sm">
                        {room
                            ? "Ask questions about the invention. AI agents will evaluate quality and propose a fair price."
                            : "Ask questions about the startup's technology. The AI agent runs inside the TEE under NDA."}
                    </p>
                </div>
            )}

            <AnimatePresence>
                {messages.map((msg, i) => {
                    const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.system;
                    return (
                        <motion.div
                            key={msg.id ?? i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className={`p-3 rounded-xl border ${style.bg}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.labelColor}`}>
                                    {style.label}
                                </span>
                                {msg.signatureVerified !== undefined && (
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${msg.signatureVerified
                                                ? "bg-stealth-green/10 text-stealth-green"
                                                : "bg-stealth-red/10 text-stealth-red"
                                            }`}
                                    >
                                        {msg.signatureVerified ? "Verified Enclave Signature" : "Signature Verification Failed"}
                                    </span>
                                )}
                                {msg.suggestedPrice !== undefined && msg.suggestedPrice > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stealth-accent/10 text-stealth-accent font-mono">
                                        💰 {msg.suggestedPrice} XTZ
                                    </span>
                                )}
                            </div>
                            <div className="text-sm text-stealth-text whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {msg.sources.map((s, j) => (
                                        <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-stealth-hover text-stealth-muted">
                                            {s.split("/").pop()}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            <div ref={bottomRef} />
        </div>
    );
}
