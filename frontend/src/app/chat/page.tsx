"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import {
    streamChat,
    negotiateDeal,
    acceptDeal,
    exitDeal,
    getDeal,
    DealRoom,
    NegotiateResponse,
} from "@/lib/api";

interface Message {
    role: "user" | "assistant" | "buyer_agent" | "seller_agent" | "system";
    content: string;
    sources?: string[];
    suggestedPrice?: number;
}

function ChatContent() {
    const searchParams = useSearchParams();
    const dealId = searchParams.get("deal");

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>();
    const [room, setRoom] = useState<DealRoom | null>(null);
    const [dealOutcome, setDealOutcome] = useState<"accepted" | "exited" | null>(null);
    const [outcomeMsg, setOutcomeMsg] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    // Load deal room if deal ID is present
    useEffect(() => {
        if (dealId) {
            getDeal(dealId)
                .then(setRoom)
                .catch(() => setRoom(null));
        }
    }, [dealId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        const q = input.trim();
        if (!q || loading) return;

        setInput("");
        setMessages((prev) => [...prev, { role: "user", content: q }]);
        setLoading(true);

        if (room && (room.status === "funded" || room.status === "negotiating")) {
            // Deal negotiation mode
            try {
                const result: NegotiateResponse = await negotiateDeal(room.room_id, q);

                setMessages((prev) => [
                    ...prev,
                    {
                        role: "buyer_agent",
                        content: result.buyer_agent,
                        suggestedPrice: result.suggested_price,
                    },
                    {
                        role: "seller_agent",
                        content: result.seller_agent,
                        sources: result.sources,
                    },
                ]);

                setRoom(result.room);
            } catch (err: unknown) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "system",
                        content: `Error: ${err instanceof Error ? err.message : "Negotiation failed"}`,
                    },
                ]);
            }
        } else {
            // Standard chat mode (no deal)
            let assistantContent = "";
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

            streamChat(
                q,
                sessionId,
                (chunk) => {
                    assistantContent += chunk;
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            role: "assistant",
                            content: assistantContent,
                        };
                        return updated;
                    });
                },
                (sid, sources) => {
                    setSessionId(sid);
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            sources,
                        };
                        return updated;
                    });
                },
                (error) => {
                    setMessages((prev) => [
                        ...prev.slice(0, -1),
                        { role: "system", content: `Error: ${error}` },
                    ]);
                }
            );
        }

        setLoading(false);
    };

    const handleAccept = async () => {
        if (!room) return;
        setLoading(true);
        try {
            const result = await acceptDeal(room.room_id);
            setDealOutcome("accepted");
            setOutcomeMsg(result.message);
            setRoom(result.room);
            setMessages((prev) => [
                ...prev,
                { role: "system", content: `✅ ${result.message}` },
            ]);
        } catch (err: unknown) {
            setMessages((prev) => [
                ...prev,
                { role: "system", content: `❌ ${err instanceof Error ? err.message : "Accept failed"}` },
            ]);
        }
        setLoading(false);
    };

    const handleExit = async () => {
        if (!room) return;
        setLoading(true);
        try {
            const result = await exitDeal(room.room_id);
            setDealOutcome("exited");
            setOutcomeMsg(result.message);
            setRoom(result.room);
            setMessages((prev) => [
                ...prev,
                { role: "system", content: `🔒 ${result.message}` },
            ]);
        } catch (err: unknown) {
            setMessages((prev) => [
                ...prev,
                { role: "system", content: `❌ ${err instanceof Error ? err.message : "Exit failed"}` },
            ]);
        }
        setLoading(false);
    };

    const roleStyles: Record<string, { bg: string; label: string; labelColor: string }> = {
        user: { bg: "bg-stealth-accent/10 border-stealth-accent/20", label: "You", labelColor: "text-stealth-accent" },
        assistant: { bg: "bg-stealth-surface border-stealth-border", label: "TEE Agent", labelColor: "text-stealth-green" },
        buyer_agent: { bg: "bg-blue-500/5 border-blue-500/20", label: "Buyer's Agent (AB)", labelColor: "text-blue-400" },
        seller_agent: { bg: "bg-emerald-500/5 border-emerald-500/20", label: "Seller's Agent (AS)", labelColor: "text-emerald-400" },
        system: { bg: "bg-stealth-gold/5 border-stealth-gold/20", label: "System", labelColor: "text-stealth-gold" },
    };

    return (
        <div className="flex flex-col h-[calc(100vh-3rem)] max-w-3xl mx-auto">
            {/* Deal Bar */}
            {room && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mt-4 p-3 rounded-xl bg-stealth-surface border border-stealth-border flex items-center gap-4 text-xs"
                >
                    <div className="flex items-center gap-1.5">
                        <span className="text-stealth-muted">Deal</span>
                        <span className="font-mono text-stealth-accent">{room.room_id}</span>
                    </div>
                    <div className="h-4 w-px bg-stealth-border" />
                    <div>
                        <span className="text-stealth-muted">Threshold:</span>{" "}
                        <span className="text-stealth-text">{room.seller_threshold} XTZ</span>
                    </div>
                    <div>
                        <span className="text-stealth-muted">Budget:</span>{" "}
                        <span className="text-stealth-text">{room.buyer_budget} XTZ</span>
                    </div>
                    {room.proposed_price > 0 && (
                        <div>
                            <span className="text-stealth-muted">Proposed:</span>{" "}
                            <span className={
                                room.proposed_price >= room.seller_threshold
                                    ? "text-stealth-green font-semibold"
                                    : "text-stealth-gold font-semibold"
                            }>
                                {room.proposed_price} XTZ
                            </span>
                        </div>
                    )}
                    <div className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${room.status === "accepted"
                            ? "bg-stealth-green/10 text-stealth-green"
                            : room.status === "exited"
                                ? "bg-stealth-red/10 text-stealth-red"
                                : "bg-stealth-gold/10 text-stealth-gold"
                        }`}>
                        {room.status}
                    </div>
                </motion.div>
            )}

            {/* Messages */}
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
                        const style = roleStyles[msg.role] || roleStyles.system;
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className={`p-3 rounded-xl border ${style.bg}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${style.labelColor}`}>
                                        {style.label}
                                    </span>
                                    {msg.suggestedPrice !== undefined && msg.suggestedPrice > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stealth-accent/10 text-stealth-accent font-mono">
                                            💰 {msg.suggestedPrice} XTZ
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-stealth-text whitespace-pre-wrap leading-relaxed">
                                    {msg.content}
                                </div>
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {msg.sources.map((s, j) => (
                                            <span
                                                key={j}
                                                className="text-[9px] px-1.5 py-0.5 rounded bg-stealth-hover text-stealth-muted"
                                            >
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

            {/* Deal Outcome Overlay */}
            <AnimatePresence>
                {dealOutcome && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center z-50 bg-stealth-bg/80 backdrop-blur-sm"
                    >
                        <div className={`p-8 rounded-2xl border text-center max-w-sm ${dealOutcome === "accepted"
                                ? "bg-stealth-green/5 border-stealth-green/30"
                                : "bg-stealth-red/5 border-stealth-red/30"
                            }`}>
                            <div className="text-5xl mb-4">
                                {dealOutcome === "accepted" ? "✅" : "🔒"}
                            </div>
                            <h2 className={`text-xl font-bold mb-2 ${dealOutcome === "accepted" ? "text-stealth-green" : "text-stealth-red"
                                }`}>
                                {dealOutcome === "accepted" ? "Deal Sealed" : "Deal Exited"}
                            </h2>
                            <p className="text-sm text-stealth-muted">{outcomeMsg}</p>
                            <button
                                onClick={() => setDealOutcome(null)}
                                className="mt-4 px-4 py-2 rounded-lg bg-stealth-surface border border-stealth-border text-sm text-stealth-text hover:bg-stealth-hover"
                            >
                                Close
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="px-4 pb-4">
                {/* Deal Action Buttons */}
                {room && room.proposed_price > 0 && !dealOutcome && (room.status === "funded" || room.status === "negotiating") && (
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={handleAccept}
                            disabled={loading || room.proposed_price < room.seller_threshold}
                            className="flex-1 py-2 rounded-lg bg-stealth-green/10 border border-stealth-green/20 text-stealth-green text-sm font-semibold hover:bg-stealth-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            ✅ Accept Deal ({room.proposed_price} XTZ)
                        </button>
                        <button
                            onClick={handleExit}
                            disabled={loading}
                            className="flex-1 py-2 rounded-lg bg-stealth-red/10 border border-stealth-red/20 text-stealth-red text-sm font-semibold hover:bg-stealth-red/20 transition-colors disabled:opacity-40"
                        >
                            🔒 Exit (Refund)
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        placeholder={
                            room
                                ? "Ask about the invention, propose a price..."
                                : "Ask about the startup's technology..."
                        }
                        disabled={loading || !!dealOutcome}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 disabled:opacity-40"
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim() || !!dealOutcome}
                        className="px-5 py-2.5 rounded-xl bg-stealth-accent text-stealth-bg text-sm font-semibold hover:bg-stealth-accent/90 transition-colors disabled:opacity-40"
                    >
                        {loading ? "..." : "Send"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ChatPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
                </div>
            }
        >
            <ChatContent />
        </Suspense>
    );
}
