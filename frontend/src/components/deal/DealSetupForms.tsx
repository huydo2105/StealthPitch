"use client";

import { NDAI_ESCROW_ADDRESS, EXPLORER_URL } from "@/lib/useNDAIEscrow";

interface FounderFormProps {
    sellerAddress: string;
    setSellerAddress: (v: string) => void;
    threshold: string;
    setThreshold: (v: string) => void;
    onSubmit: () => void;
    walletAddress: string | undefined;
}

export function FounderForm({
    sellerAddress, setSellerAddress, threshold, setThreshold, onSubmit, walletAddress
}: FounderFormProps) {
    return (
        <div className="p-5 rounded-xl bg-stealth-surface border border-stealth-border space-y-4">
            <h2 className="text-sm font-semibold text-stealth-text">Create Deal Room</h2>
            <p className="text-xs text-stealth-muted">
                Set your acceptance threshold — the minimum price you&apos;ll accept for disclosing your IP.
                Registering on-chain locks the threshold in the{" "}
                <a href={`${EXPLORER_URL}/address/${NDAI_ESCROW_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-stealth-accent hover:underline">
                    NDAIEscrow contract
                </a>.
            </p>
            <div className="space-y-3">
                <div>
                    <label className="text-xs text-stealth-muted block mb-1">
                        Founder Wallet Address
                        {walletAddress && <span className="ml-2 text-stealth-green">● auto-filled</span>}
                    </label>
                    <input
                        type="text" placeholder="0x…" value={sellerAddress}
                        onChange={(e) => setSellerAddress(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 font-mono"
                    />
                </div>
                <div>
                    <label className="text-xs text-stealth-muted block mb-1">
                        Acceptance Threshold (XTZ) — minimum acceptable price
                    </label>
                    <input
                        type="number" step="0.01" min="0" placeholder="e.g. 5.0" value={threshold}
                        onChange={(e) => setThreshold(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                    />
                </div>
            </div>
            <button
                onClick={onSubmit} disabled={!walletAddress}
                className="cursor-pointer w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {walletAddress ? "Create Deal Room" : "Connect Wallet First"}
            </button>
        </div>
    );
}

interface InvestorFormProps {
    roomIdInput: string;
    setRoomIdInput: (v: string) => void;
    buyerAddress: string;
    setBuyerAddress: (v: string) => void;
    budget: string;
    setBudget: (v: string) => void;
    onSubmit: () => void;
    walletAddress: string | undefined;
}

export function InvestorForm({
    roomIdInput, setRoomIdInput, buyerAddress, setBuyerAddress, budget, setBudget, onSubmit, walletAddress
}: InvestorFormProps) {
    return (
        <div className="p-5 rounded-xl bg-stealth-surface border border-stealth-border space-y-4">
            <h2 className="text-sm font-semibold text-stealth-text">Join Deal Room</h2>
            <p className="text-xs text-stealth-muted">
                Enter the deal room ID and set your budget cap — the maximum you&apos;ll pay. Funds will be deposited into the{" "}
                <a href={`${EXPLORER_URL}/address/${NDAI_ESCROW_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-stealth-accent hover:underline">
                    NDAIEscrow contract.
                </a>
            </p>
            <div className="space-y-3">
                <div>
                    <label className="text-xs text-stealth-muted block mb-1">Deal Room ID</label>
                    <input
                        type="text" placeholder="e.g. a1b2c3d4" value={roomIdInput}
                        onChange={(e) => setRoomIdInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                    />
                </div>
                <div>
                    <label className="text-xs text-stealth-muted block mb-1">
                        Investor Wallet Address
                        {walletAddress && <span className="ml-2 text-stealth-green">● auto-filled</span>}
                    </label>
                    <input
                        type="text" placeholder="0x…" value={buyerAddress}
                        onChange={(e) => setBuyerAddress(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50 font-mono"
                    />
                </div>
                <div>
                    <label className="text-xs text-stealth-muted block mb-1">
                        Budget Cap (XTZ) — maximum you&apos;ll pay (deposited to escrow)
                    </label>
                    <input
                        type="number" step="0.01" min="0" placeholder="e.g. 10.0" value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-stealth-input border border-stealth-input-border text-sm text-stealth-text placeholder:text-stealth-muted/50 focus:outline-none focus:border-stealth-accent/50"
                    />
                </div>
            </div>
            <button
                onClick={onSubmit} disabled={!walletAddress}
                className="cursor-pointer w-full py-2.5 rounded-lg bg-stealth-accent text-stealth-bg font-semibold text-sm hover:bg-stealth-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {walletAddress ? "Join Deal Room" : "Connect Wallet First"}
            </button>
        </div>
    );
}
