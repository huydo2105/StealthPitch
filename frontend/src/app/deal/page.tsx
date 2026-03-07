"use client";

import { Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDealSetup } from "@/hooks/useDealSetup";
import { FounderForm, InvestorForm } from "@/components/deal/DealSetupForms";
import { CreatedPanel, JoinedPanel, AcceptedPanel, ExitedPanel, TxHistoryPanel } from "@/components/deal/DealRoomPanels";
import { DealHistorySection } from "@/components/deal/DealHistorySection";

function DealRoomContent() {
    const state = useDealSetup();
    const {
        role, setRole, phase, setPhase, error,
        room, dealHistory, router,
        sellerAddress, setSellerAddress, threshold, setThreshold,
        roomIdInput, setRoomIdInput, buyerAddress, setBuyerAddress, budget, setBudget,
        getRootProps, getInputProps, isDragActive, uploadPhase, uploadMsg,
        handleCreateDeal, handleJoinDeal, refreshRoom,
        walletAddress, createTxHash, isCreateConfirming, isCreateConfirmed,
        depositTxHash, isDepositConfirming, isDepositConfirmed, onChainError,
    } = state;

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <h1 className="text-2xl font-bold text-stealth-bright">🤝 Deal Room</h1>
                <p className="text-sm text-stealth-muted">
                    NDAI Protocol — Secure invention disclosure with smart contract settlement on{" "}
                    <a href="https://shadownet.explorer.etherlink.com" target="_blank" rel="noopener noreferrer" className="text-stealth-accent hover:underline">
                        Etherlink
                    </a>
                </p>
            </motion.div>

            {/* Role Toggle */}
            <div className="flex gap-2 p-1 bg-stealth-surface rounded-lg border border-stealth-border w-fit">
                {(["founder", "investor"] as const).map((r) => (
                    <button
                        key={r}
                        onClick={() => { setRole(r); setPhase("setup"); }}
                        className={`cursor-pointer px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${role === r ? "bg-stealth-accent text-stealth-bg" : "text-stealth-muted hover:text-stealth-text"}`}
                    >
                        {r === "founder" ? "🚀 Founder" : "💼 Investor"}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {/* Setup / Error */}
                {(phase === "setup" || phase === "error") && (
                    <motion.div key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
                        {role === "founder" ? (
                            <FounderForm
                                sellerAddress={sellerAddress} setSellerAddress={setSellerAddress}
                                threshold={threshold} setThreshold={setThreshold}
                                onSubmit={handleCreateDeal} walletAddress={walletAddress}
                            />
                        ) : (
                            <InvestorForm
                                roomIdInput={roomIdInput} setRoomIdInput={setRoomIdInput}
                                buyerAddress={buyerAddress} setBuyerAddress={setBuyerAddress}
                                budget={budget} setBudget={setBudget}
                                onSubmit={handleJoinDeal} walletAddress={walletAddress}
                            />
                        )}
                        {error && (
                            <div className="p-3 rounded-lg bg-stealth-red/10 border border-stealth-red/20 text-sm text-stealth-red">{error}</div>
                        )}
                    </motion.div>
                )}

                {/* Loading */}
                {(phase === "creating" || phase === "joining") && (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-12">
                        <div className="w-10 h-10 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
                        <p className="text-sm text-stealth-muted">
                            {phase === "creating" ? "Creating deal room…" : "Depositing To Escrow and Joining Deal Room…"}
                        </p>
                    </motion.div>
                )}

                {/* Created */}
                {phase === "created" && room && (
                    <CreatedPanel
                        room={room} onChainError={onChainError}
                        createTxHash={createTxHash} isCreateConfirming={isCreateConfirming} isCreateConfirmed={isCreateConfirmed}
                        getRootProps={getRootProps} getInputProps={getInputProps} isDragActive={isDragActive}
                        uploadPhase={uploadPhase} uploadMsg={uploadMsg}
                        onRefresh={refreshRoom}
                    />
                )}

                {/* Joined */}
                {phase === "joined" && room && (
                    <JoinedPanel
                        room={room} onChainError={onChainError}
                        depositTxHash={depositTxHash} isDepositConfirming={isDepositConfirming} isDepositConfirmed={isDepositConfirmed}
                        onRefresh={refreshRoom}
                    />
                )}
            </AnimatePresence>

            {/* Settled Panels */}
            {room?.status === "accepted" && <AcceptedPanel room={room} />}
            {room?.status === "exited" && <ExitedPanel room={room} />}

            {/* Tx History */}
            {room && <TxHistoryPanel room={room} />}

            {/* Deal History */}
            <DealHistorySection deals={dealHistory} router={router} />
        </div>
    );
}

export default function DealPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-stealth-accent/30 border-t-stealth-accent rounded-full animate-spin" />
            </div>
        }>
            <DealRoomContent />
        </Suspense>
    );
}
