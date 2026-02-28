"use client";

/**
 * DealRoomChat — Real-time founder ↔ investor chat panel for a deal room.
 *
 * Human messages are sent via POST /api/deal/{roomId}/message and persisted
 * to Supabase. Supabase realtime broadcasts every INSERT to all subscribers,
 * so both participants see messages instantly without polling.
 *
 * If a message contains @Agent, the backend runs the RAG pipeline (with
 * full PolicyGate enforcement) and writes the agent reply as a second INSERT,
 * which also arrives via the same Supabase subscription.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    sendDealHumanMessage,
    subscribeToSessionMessages,
    fetchChatSessions,
    fetchChatMessages,
    ChatMessageRow,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

type ChatRole = ChatMessageRow["role"];

interface DisplayMessage {
    id: string;
    role: ChatRole;
    content: string;
    sender?: string; // wallet address stored in metadata
    createdAt: string;
    sources?: string[];
}

interface DealRoomChatProps {
    roomId: string;
    walletAddress: string;
    role: "founder" | "investor";
    /** Pre-resolved session ID if already known from the parent (avoids duplicate resolution). */
    initialSessionId?: string;
}

// ── Role styling ───────────────────────────────────────────────────────────

function getBubbleStyle(
    msgRole: ChatRole,
    senderWallet: string | undefined,
    currentWallet: string
): { wrapper: string; bubble: string; label: string; labelColor: string; align: string } {
    const isSelf =
        senderWallet && senderWallet.toLowerCase() === currentWallet.toLowerCase();

    if (msgRole === "agent") {
        return {
            wrapper: "w-full",
            bubble: "bg-stealth-surface border border-stealth-green/30 rounded-xl p-3",
            label: "🤖 TEE Agent",
            labelColor: "text-stealth-green",
            align: "items-start",
        };
    }
    if (msgRole === "founder" || msgRole === "investor") {
        if (isSelf) {
            return {
                wrapper: "flex justify-end",
                bubble: "bg-stealth-accent/15 border border-stealth-accent/30 rounded-xl p-3 max-w-[80%]",
                label: msgRole === "founder" ? "🚀 You (Founder)" : "💼 You (Investor)",
                labelColor: "text-stealth-accent",
                align: "items-end",
            };
        }
        return {
            wrapper: "flex justify-start",
            bubble: "bg-stealth-surface border border-stealth-border rounded-xl p-3 max-w-[80%]",
            label: msgRole === "founder" ? "🚀 Founder" : "💼 Investor",
            labelColor: "text-stealth-muted",
            align: "items-start",
        };
    }
    // system / fallback
    return {
        wrapper: "w-full",
        bubble: "bg-stealth-gold/5 border border-stealth-gold/20 rounded-xl p-3",
        label: "System",
        labelColor: "text-stealth-gold",
        align: "items-start",
    };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DealRoomChat({
    roomId,
    walletAddress,
    role,
    initialSessionId,
}: DealRoomChatProps) {
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
    const [collapsed, setCollapsed] = useState(false);
    const seenIds = useRef<Set<string>>(new Set());
    const bottomRef = useRef<HTMLDivElement>(null);

    // ── Session resolution ─────────────────────────────────────────────────

    useEffect(() => {
        if (sessionId || !walletAddress) return;

        const resolve = async () => {
            try {
                const sessions = await fetchChatSessions(walletAddress);
                const match = sessions.find((s) => s.deal_room_id === roomId);
                if (match?.id) {
                    setSessionId(match.id);
                }
            } catch {
                // Retry handled by interval below
            }
        };

        void resolve();
        const id = setInterval(resolve, 3000);
        return () => clearInterval(id);
    }, [walletAddress, roomId, sessionId]);

    // ── Load history when session is first known ───────────────────────────

    useEffect(() => {
        if (!sessionId || !walletAddress) return;

        fetchChatMessages(sessionId)
            .then((rows) => {
                const humanAgentRows = rows.filter((r) =>
                    ["founder", "investor", "agent"].includes(r.role)
                );
                seenIds.current = new Set(humanAgentRows.map((r) => String(r.id)));
                setMessages(
                    humanAgentRows.map((r) => ({
                        id: String(r.id),
                        role: r.role,
                        content: r.content,
                        sender: r.metadata?.sender as string | undefined,
                        createdAt: r.created_at,
                        sources: Array.isArray(r.metadata?.sources)
                            ? (r.metadata.sources as string[])
                            : undefined,
                    }))
                );
            })
            .catch(() => {
                // Ignore: empty state on error
            });
    }, [sessionId, walletAddress]);

    // ── Supabase realtime subscription ─────────────────────────────────────

    useEffect(() => {
        if (!sessionId) return;

        const unsubscribe = subscribeToSessionMessages(sessionId, (row) => {
            // Only display human chat roles in this panel
            if (!["founder", "investor", "agent"].includes(row.role)) return;
            const msgId = String(row.id);
            if (seenIds.current.has(msgId)) return;
            seenIds.current.add(msgId);

            setMessages((prev) => [
                ...prev,
                {
                    id: msgId,
                    role: row.role,
                    content: row.content,
                    sender: row.metadata?.sender as string | undefined,
                    createdAt: row.created_at,
                    sources: Array.isArray(row.metadata?.sources)
                        ? (row.metadata.sources as string[])
                        : undefined,
                },
            ]);
        });

        return unsubscribe;
    }, [sessionId]);

    // ── Auto-scroll ────────────────────────────────────────────────────────

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Send handler ───────────────────────────────────────────────────────

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || sending || !walletAddress) return;
        setInput("");
        setSending(true);

        try {
            const tempId = `temp-${Date.now()}`;
            setMessages((prev) => [
                ...prev,
                {
                    id: tempId,
                    role: role,
                    content: text,
                    sender: walletAddress,
                    createdAt: new Date().toISOString(),
                },
            ]);

            const res = await sendDealHumanMessage(roomId, walletAddress, role, text);
            // If the session was just created by this send, pick it up
            if (!sessionId && res.session_id) {
                setSessionId(res.session_id);
            }
        } catch (err) {
            // Re-inject an error bubble locally (no Supabase write for send errors)
            const errId = `err-${Date.now()}`;
            setMessages((prev) => [
                ...prev,
                {
                    id: errId,
                    role: "agent" as ChatRole,
                    content: `⚠️ Send failed: ${err instanceof Error ? err.message : "Unknown error"}`,
                    createdAt: new Date().toISOString(),
                },
            ]);
        } finally {
            setSending(false);
        }
    }, [input, sending, walletAddress, roomId, role, sessionId]);

    const mentionsAgent = input.trim().toLowerCase().includes("@agent");

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="mx-4 mb-3 rounded-xl border border-stealth-border bg-stealth-surface overflow-hidden">
            {/* Panel header */}
            <button
                onClick={() => setCollapsed((c) => !c)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-stealth-muted hover:text-stealth-text transition-colors"
            >
                <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-stealth-green animate-pulse" />
                    💬 Live Deal Chat
                    {messages.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-stealth-accent/10 text-stealth-accent text-[10px]">
                            {messages.length}
                        </span>
                    )}
                </span>
                <span className="text-stealth-muted">{collapsed ? "▸ expand" : "▾ collapse"}</span>
            </button>

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {/* Message list */}
                        <div className="h-64 overflow-y-auto px-3 py-2 space-y-2 border-t border-stealth-border">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
                                    <span className="text-2xl">💬</span>
                                    <p className="text-xs text-stealth-muted">
                                        Start the conversation. Type{" "}
                                        <code className="bg-stealth-hover px-1 rounded text-stealth-accent">
                                            @Agent
                                        </code>{" "}
                                        to ask the TEE Agent.
                                    </p>
                                </div>
                            )}

                            {messages.map((msg) => {
                                const style = getBubbleStyle(msg.role, msg.sender, walletAddress);
                                return (
                                    <motion.div
                                        key={msg.id}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className={style.wrapper}
                                    >
                                        <div className={style.bubble}>
                                            <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${style.labelColor}`}>
                                                {style.label}
                                                {msg.role === "agent" && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-stealth-green/10 text-stealth-green text-[9px] normal-case tracking-normal">
                                                        Enclave Enforced
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-stealth-text whitespace-pre-wrap leading-relaxed">
                                                {msg.content}
                                            </p>
                                            {msg.sources && msg.sources.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                    {msg.sources.map((s, i) => (
                                                        <span
                                                            key={i}
                                                            className="text-[9px] px-1.5 py-0.5 rounded bg-stealth-hover text-stealth-muted"
                                                        >
                                                            {s.split("/").pop()}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                            <div ref={bottomRef} />
                        </div>

                        {/* Input row */}
                        <div className="px-3 py-2 border-t border-stealth-border flex gap-2 items-center">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                                    placeholder="Message… (type @Agent to ask TEE)"
                                    disabled={sending}
                                    className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 disabled:opacity-40"
                                />
                                {mentionsAgent && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-stealth-green font-semibold pointer-events-none">
                                        🤖 Agent will reply
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={sending || !input.trim()}
                                className="px-4 py-2 rounded-lg bg-stealth-accent text-stealth-bg text-sm font-semibold hover:bg-stealth-accent/90 transition-colors disabled:opacity-40"
                            >
                                {sending ? "…" : "Send"}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
