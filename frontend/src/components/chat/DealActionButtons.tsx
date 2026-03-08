"use client";

import { useState, useEffect } from "react";
import { explorerTxUrl } from "@/lib/useNDAIEscrow";
import { DealRoom, downloadDealDocuments } from "@/lib/api";
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
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

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
    const canUnlock = room.status === "accepted" && !dealOutcome && isInvestor;

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

            {/* Reveal + Download (post-accept, investor only) */}
            {canUnlock && (
                <div className="mt-2 space-y-2">
                    {/* Reveal Raw Disclosure */}
                    <button
                        onClick={onReveal}
                        disabled={revealLoading}
                        title="Query the TEE for unrestricted technical disclosure"
                        className="cursor-pointer w-full py-2.5 rounded-xl bg-stealth-gold/10 border border-stealth-gold/30 text-stealth-gold text-sm font-semibold hover:bg-stealth-gold/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {revealLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Unlocking…
                            </>
                        ) : (
                            <>
                                <span>🔓</span>
                                Unlock Raw Disclosure
                            </>
                        )}
                    </button>

                    {/* Download Original Documents */}
                    <button
                        onClick={async () => {
                            setDownloadLoading(true);
                            setDownloadError(null);
                            try {
                                await downloadDealDocuments(room.room_id);
                            } catch (err) {
                                setDownloadError(err instanceof Error ? err.message : "Download failed");
                            } finally {
                                setDownloadLoading(false);
                            }
                        }}
                        disabled={downloadLoading}
                        title="Download the original uploaded documents as a ZIP archive"
                        className="cursor-pointer w-full py-2.5 rounded-xl bg-stealth-accent/10 border border-stealth-accent/30 text-stealth-accent text-sm font-semibold hover:bg-stealth-accent/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {downloadLoading ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Preparing ZIP…
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                </svg>
                                Download Raw Documents (.zip)
                            </>
                        )}
                    </button>
                    {downloadError && (
                        <p className="text-[11px] text-stealth-red text-center mt-1">{downloadError}</p>
                    )}
                </div>
            )}
        </div>
    );
}
