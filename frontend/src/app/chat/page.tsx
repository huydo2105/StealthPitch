"use client";

import { useState, useEffect, Suspense } from "react";
import { acceptDeal, exitDeal, negotiateDeal, revealDeal, sendDealHumanMessage, streamChat, NegotiateResponse } from "@/lib/api";
import { verifyEnclaveSignature } from "@/lib/signature";
import { useCancelDeal } from "@/lib/useNDAIEscrow";
import { useDealRoom } from "@/hooks/useDealRoom";
import DealBar from "@/components/chat/DealBar";
import ChatMessageList from "@/components/chat/ChatMessageList";
import DealActionButtons from "@/components/chat/DealActionButtons";
import DealOutcomeOverlay from "@/components/chat/DealOutcomeOverlay";
import { ChatMessage } from "@/types/chat";

function ChatContent() {
    const {
        walletAddress,
        dealId,
        messages,
        setMessages,
        sessionId,
        setSessionId,
        room,
        setRoom,
        bottomRef,
        participantRole,
    } = useDealRoom();

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [revealLoading, setRevealLoading] = useState(false);
    const [dealOutcome, setDealOutcome] = useState<"accepted" | "exited" | null>(null);
    const [outcomeMsg, setOutcomeMsg] = useState("");

    // On-chain cancel (direct wallet tx)
    const {
        cancelDealOnChain,
        isPending: isCancelPending,
        isConfirming: isCancelConfirming,
        isConfirmed: isCancelConfirmed,
        txHash: cancelTxHash,
        error: cancelError,
        reset: resetCancel,
    } = useCancelDeal();

    // Show a system message when on-chain cancel confirms
    useEffect(() => {
        if (isCancelConfirmed && cancelTxHash) {
            setMessages((prev) => [
                ...prev,
                { role: "system", content: `⛔ Deal cancelled on-chain. Tx: ${cancelTxHash}` },
            ]);
        }
    }, [isCancelConfirmed, cancelTxHash, setMessages]);

    // ── Action handlers ─────────────────────────────────────────────────

    const addSystemMsg = (content: string) =>
        setMessages((prev) => [...prev, { role: "system", content } as ChatMessage]);

    const handleAccept = async () => {
        if (!room) return;
        setLoading(true);
        try {
            const result = await acceptDeal(room.room_id);
            setDealOutcome("accepted");
            setOutcomeMsg(result.message);
            setRoom(result.room);
            addSystemMsg(`✅ ${result.message}`);
        } catch (err) {
            addSystemMsg(`❌ ${err instanceof Error ? err.message : "Accept failed"}`);
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
            addSystemMsg(`🔒 ${result.message}`);
        } catch (err) {
            addSystemMsg(`❌ ${err instanceof Error ? err.message : "Exit failed"}`);
        }
        setLoading(false);
    };

    const handleCancelOnChain = async () => {
        if (!room) return;
        resetCancel();
        try {
            await cancelDealOnChain(room.room_id);
            addSystemMsg("⛔ Cancel transaction submitted. Waiting for confirmation…");
        } catch (err) {
            addSystemMsg(`❌ Cancel failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
    };

    const handleReveal = async () => {
        if (!room) return;
        setRevealLoading(true);
        try {
            const result = await revealDeal(room.room_id, "Reveal the raw implementation details and formulas.");
            const verified = await verifyEnclaveSignature({
                payload: result.signature_payload,
                signatureB64: result.signature,
                publicKeyPem: result.signing_public_key_pem,
            });
            setMessages((prev) => [
                ...prev,
                { role: "system", content: result.answer, sources: result.sources, signatureVerified: verified },
            ]);
        } catch (err) {
            addSystemMsg(`Reveal failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        } finally {
            setRevealLoading(false);
        }
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setInput("");
        setLoading(true);

        if (room) {
            // Deal room command routing
            if (room.status === "funded" || room.status === "negotiating") {
                const proposeMatch = text.match(/^\s*\/propose\s+([\d.]+)/i);
                if (proposeMatch) {
                    try {
                        const result: NegotiateResponse = await negotiateDeal(
                            room.room_id,
                            `Proposing ${proposeMatch[1]} XTZ`,
                            participantRole || "investor",
                            walletAddress || undefined
                        );
                        setRoom(result.room);
                        if (result.session_id) setSessionId(result.session_id);
                    } catch (err) {
                        addSystemMsg(`Error: ${err instanceof Error ? err.message : "Negotiation failed"}`);
                    }
                    setLoading(false);
                    return;
                }
                if (/^\s*\/accept/i.test(text)) { await handleAccept(); setLoading(false); return; }
                if (/^\s*\/exit/i.test(text)) { await handleExit(); setLoading(false); return; }
            }

            // Human message (with optional @buyer_agent / @seller_agent RAG trigger)
            try {
                if (walletAddress && (participantRole === "founder" || participantRole === "investor")) {
                    const tempId = `temp-${Date.now()}`;
                    setMessages((prev) => [
                        ...prev,
                        { id: tempId, role: participantRole, content: text, sender: walletAddress },
                    ]);
                    const res = await sendDealHumanMessage(room.room_id, walletAddress, participantRole, text);
                    if (!sessionId && res.session_id) setSessionId(res.session_id);
                } else {
                    throw new Error("Only founder or investor can chat here.");
                }
            } catch (err) {
                addSystemMsg(`⚠️ Send failed: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
        } else {
            // Standalone AI chat (no deal room)
            let systemContent = "";
            const tempSysId = `sys-${Date.now()}`;
            setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: text }, { id: tempSysId, role: "system", content: "" }]);

            streamChat(
                text,
                sessionId,
                walletAddress,
                dealId || undefined,
                participantRole,
                (chunk) => {
                    systemContent += chunk;
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { id: tempSysId, role: "system", content: systemContent };
                        return updated;
                    });
                },
                (payload) => {
                    setSessionId(payload.sessionId);
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...updated[updated.length - 1],
                            id: payload.sessionId ? `${payload.sessionId}-${Date.now()}` : tempSysId,
                            sources: payload.sources,
                        };
                        return updated;
                    });
                    if (payload.signature && payload.signaturePayload && payload.signingPublicKeyPem) {
                        verifyEnclaveSignature({
                            payload: payload.signaturePayload,
                            signatureB64: payload.signature,
                            publicKeyPem: payload.signingPublicKeyPem,
                        }).then((verified) => {
                            setMessages((prev) => {
                                const updated = [...prev];
                                updated[updated.length - 1] = { ...updated[updated.length - 1], signatureVerified: verified };
                                return updated;
                            });
                        });
                    }
                },
                (error) => {
                    setMessages((prev) => [...prev.slice(0, -1), { role: "system", content: `Error: ${error}` }]);
                }
            );
        }

        setLoading(false);
    };

    return (
        <div className="relative flex flex-col h-[calc(100vh-3rem)] max-w-3xl mx-auto">
            {room && <DealBar room={room} />}

            <ChatMessageList messages={messages} room={room} bottomRef={bottomRef} />

            <DealOutcomeOverlay
                dealOutcome={dealOutcome}
                outcomeMsg={outcomeMsg}
                onClose={() => setDealOutcome(null)}
            />

            {room ? (
                <DealActionButtons
                    room={room}
                    loading={loading}
                    revealLoading={revealLoading}
                    dealOutcome={dealOutcome}
                    walletAddress={walletAddress}
                    onAccept={handleAccept}
                    onExit={handleExit}
                    onReveal={handleReveal}
                    onCancelOnChain={handleCancelOnChain}
                    isCancelPending={isCancelPending}
                    isCancelConfirming={isCancelConfirming}
                    cancelTxHash={cancelTxHash}
                    cancelError={cancelError}
                    input={input}
                    onInputChange={setInput}
                    onSend={handleSend}
                />
            ) : (
                <div className="px-4 pb-4">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                            placeholder="Ask about the startup's technology..."
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 disabled:opacity-40"
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="px-5 py-2.5 rounded-xl bg-stealth-accent text-stealth-bg text-sm font-semibold hover:bg-stealth-accent/90 transition-colors disabled:opacity-40"
                        >
                            {loading ? "..." : "Send"}
                        </button>
                    </div>
                </div>
            )}
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
