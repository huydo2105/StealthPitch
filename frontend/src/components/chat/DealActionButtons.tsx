"use client";

import { useState, useEffect } from "react";
import { explorerTxUrl } from "@/lib/useNDAIEscrow";
import { DealRoom } from "@/lib/api";
import { ChatMessage } from "@/types/chat";

interface DealActionButtonsProps {
    room: DealRoom;
    messages: ChatMessage[];
    loading: boolean;
    revealLoading: boolean;
    dealOutcome: "accepted" | "exited" | null;
    walletAddress: string | undefined;
    participantRole: "founder" | "investor" | "member" | null | undefined;
    // TEE-mediated actions (backend signs on-chain)
    onAccept: () => void;
    onExit: () => void;
    onReveal: () => void;
    // Direct wallet cancel (seller only, pre-funding)
    onCancelOnChain: () => void;
    isCancelPending: boolean;
    isCancelConfirming: boolean;
    cancelTxHash: `0x${string}` | undefined;
    cancelError: Error | null;
    // Chat input
    input: string;
    onInputChange: (val: string) => void;
    onSend: () => void;
}

export default function DealActionButtons({
    room,
    messages,
    loading,
    revealLoading,
    dealOutcome,
    walletAddress,
    participantRole,
    onAccept,
    onExit,
    onReveal,
    onCancelOnChain,
    isCancelPending,
    isCancelConfirming,
    cancelTxHash,
    cancelError,
    input,
    onInputChange,
    onSend,
}: DealActionButtonsProps) {
    const isInvestor = participantRole === "investor";
    const isFounder = participantRole === "founder";
    const isSeller = walletAddress && room.seller_address.toLowerCase() === walletAddress.toLowerCase();

    const [currentPrice, setCurrentPrice] = useState(room.proposed_price);

    useEffect(() => {
        // Find the latest message that contains a suggested price
        const lastPriceMsg = [...messages].reverse().find(m => m.suggestedPrice !== undefined);
        if (lastPriceMsg && lastPriceMsg.suggestedPrice !== undefined) {
            setCurrentPrice(lastPriceMsg.suggestedPrice);
        } else {
            setCurrentPrice(room.proposed_price);
        }
    }, [messages, room.proposed_price]);

    const canAccept =
        isFounder && currentPrice > 0 && !dealOutcome && (room.status === "funded" || room.status === "negotiating");
    const canExit =
        isInvestor && currentPrice > 0 && !dealOutcome && (room.status === "funded" || room.status === "negotiating");
    const canCancel = room.status === "created" && !dealOutcome && isSeller;

    return (
        <div className="px-4 pb-4">
            {/* Accept Deal — founder only */}
            {canAccept && (
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={onAccept}
                        disabled={loading || currentPrice < room.seller_threshold}
                        title={currentPrice < room.seller_threshold ? "Proposed price is below threshold" : "TEE signs acceptDeal on-chain"}
                        className="cursor-pointer flex-1 py-2 rounded-lg bg-stealth-green/10 border border-stealth-green/20 text-stealth-green text-sm font-semibold hover:bg-stealth-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        ✅ Accept Deal ({currentPrice} XTZ)
                    </button>
                </div>
            )}

            {/* Exit / Refund — investor only */}
            {canExit && (
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={onExit}
                        disabled={loading}
                        title="TEE signs exitDeal on-chain → full refund to investor"
                        className="cursor-pointer flex-1 py-2 rounded-lg bg-stealth-red/10 border border-stealth-red/20 text-stealth-red text-sm font-semibold hover:bg-stealth-red/20 transition-colors disabled:opacity-40"
                    >
                        🔒 Exit (Refund)
                    </button>
                </div>
            )}

            {/* Cancel (direct wallet tx, seller only, pre-funding) */}
            {canCancel && (
                <div className="mb-3">
                    <button
                        onClick={onCancelOnChain}
                        disabled={isCancelPending || isCancelConfirming}
                        title="Cancel the deal on-chain before it is funded (your wallet signs this)"
                        className="cursor-pointer w-full py-2 rounded-lg bg-stealth-gold/10 border border-stealth-gold/20 text-stealth-gold text-sm font-semibold hover:bg-stealth-gold/20 transition-colors disabled:opacity-40"
                    >
                        {isCancelPending ? "Confirm in wallet…" : isCancelConfirming ? "Confirming on-chain…" : "⛔ Cancel Deal (on-chain)"}
                    </button>
                    {/* {cancelError && <p className="mt-1 text-[10px] text-stealth-red">{cancelError.message}</p>} */}
                    {cancelTxHash && (
                        <a
                            href={explorerTxUrl(cancelTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block text-[10px] text-stealth-muted hover:text-stealth-accent underline"
                        >
                            View tx ↗
                        </a>
                    )}
                </div>
            )}

            {/* Chat input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSend()}
                    placeholder={room ? "Ask about the invention, propose a price..." : "Ask about the startup's technology..."}
                    disabled={loading || !!dealOutcome}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 disabled:opacity-40"
                />
                <button
                    onClick={onSend}
                    disabled={loading || !input.trim() || !!dealOutcome}
                    className="px-5 py-2.5 rounded-xl bg-stealth-accent text-stealth-bg text-sm font-semibold hover:bg-stealth-accent/90 transition-colors disabled:opacity-40"
                >
                    {loading ? "..." : "Send"}
                </button>
            </div>

            {/* Reveal (post-accept) */}
            {room.status === "accepted" && (
                <button
                    onClick={onReveal}
                    disabled={revealLoading}
                    className="mt-2 w-full py-2 rounded-lg bg-stealth-gold/10 border border-stealth-gold/20 text-stealth-gold text-sm font-semibold hover:bg-stealth-gold/20 disabled:opacity-50"
                >
                    {revealLoading ? "Revealing..." : "Unlock Raw Disclosure (Post-Accept)"}
                </button>
            )}
        </div>
    );
}
