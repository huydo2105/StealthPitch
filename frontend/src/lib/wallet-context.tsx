"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface WalletContextValue {
    walletAddress: string | null;
    connectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const STORAGE_KEY = "stealthpitch.wallet";

function generateDemoWalletAddress(): string {
    // Deterministic demo wallet (valid 42-char hex address).
    return "0x71c71c71c71c71c71c71c71c71c71c71c71c3a90";
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [walletAddress, setWalletAddress] = useState<string | null>(null);

    useEffect(() => {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setWalletAddress(stored);
        }
    }, []);

    const connectWallet = () => {
        const addr = generateDemoWalletAddress();
        setWalletAddress(addr);
        window.localStorage.setItem(STORAGE_KEY, addr);
    };

    const value = useMemo(
        () => ({ walletAddress, connectWallet }),
        [walletAddress]
    );

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error("useWallet must be used inside WalletProvider");
    }
    return ctx;
}
