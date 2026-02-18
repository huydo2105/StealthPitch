"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sendChat } from "@/lib/api";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: string[];
}

const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>();
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = async () => {
        const query = input.trim();
        if (!query || isLoading) return;

        setInput("");
        setError(null);

        const userMsg: Message = {
            id: `user-${Date.now()}`,
            role: "user",
            content: query,
        };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const res = await sendChat(query, sessionId);
            setSessionId(res.session_id);

            const assistantMsg: Message = {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                content: res.answer,
                sources: res.sources,
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Chat error");
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full max-w-3xl mx-auto">
            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
                {messages.length === 0 && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center h-full text-center"
                    >
                        <span className="text-5xl mb-4">💬</span>
                        <h3 className="text-xl font-semibold text-stealth-text mb-2">
                            Investor Due Diligence
                        </h3>
                        <p className="text-stealth-muted text-sm max-w-md leading-relaxed">
                            Ask questions about the startup&apos;s technology, architecture,
                            and metrics. The AI agent will answer under NDA constraints — no
                            raw IP will be disclosed.
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {[
                                "What's the tech stack?",
                                "Describe the architecture",
                                "What are the key metrics?",
                            ].map((q) => (
                                <button
                                    key={q}
                                    onClick={() => {
                                        setInput(q);
                                        inputRef.current?.focus();
                                    }}
                                    className="px-3 py-1.5 rounded-full text-xs bg-stealth-surface border border-stealth-border text-stealth-muted hover:text-stealth-text hover:border-stealth-muted transition-colors"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            variants={messageVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className={`mb-5 flex ${msg.role === "user" ? "justify-end" : "justify-start"
                                }`}
                        >
                            <div
                                className={`max-w-[85%] ${msg.role === "user"
                                        ? "bg-stealth-input rounded-2xl rounded-br-md px-4 py-3"
                                        : "px-1 py-2"
                                    }`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-sm">🤖</span>
                                        <span className="text-xs font-medium text-stealth-muted">
                                            StealthPitch Agent
                                        </span>
                                    </div>
                                )}

                                <p className="text-sm text-stealth-text whitespace-pre-wrap leading-relaxed">
                                    {msg.content}
                                </p>

                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {msg.sources.map((src, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-stealth-surface border border-stealth-border text-stealth-muted"
                                            >
                                                📎 {src.split("/").pop()}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Typing Indicator */}
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 px-1 py-2"
                    >
                        <span className="text-sm">🤖</span>
                        <div className="flex items-center gap-1">
                            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-stealth-muted" />
                            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-stealth-muted" />
                            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-stealth-muted" />
                        </div>
                    </motion.div>
                )}

                {/* Error */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mx-auto max-w-md rounded-xl bg-stealth-red/10 border border-stealth-red/20 p-3 text-center text-sm text-stealth-red"
                    >
                        {error}
                    </motion.div>
                )}
            </div>

            {/* Input Bar */}
            <div className="flex-shrink-0 px-6 pb-6 pt-2">
                <div className="relative max-w-3xl mx-auto">
                    <div className="flex items-end gap-2 rounded-2xl bg-stealth-input border border-stealth-input-border px-4 py-3 shadow-lg">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Message StealthPitch..."
                            rows={1}
                            className="flex-1 bg-transparent text-sm text-stealth-text placeholder:text-stealth-muted outline-none resize-none max-h-32"
                            style={{
                                height: "auto",
                                minHeight: "24px",
                            }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = "auto";
                                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="flex-shrink-0 w-8 h-8 rounded-full bg-stealth-text text-stealth-bg flex items-center justify-center transition-opacity disabled:opacity-30 hover:opacity-80"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 12h14m-7-7l7 7-7 7"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
