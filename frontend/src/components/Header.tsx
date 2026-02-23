"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useEffect, useState } from "react";

export default function Header() {
    const { address, isConnected } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleConnect = () => {
        if (isConnected) {
            disconnect();
        } else {
            connect({ connector: injected() });
        }
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return (
        <header className="shrink-0 h-16 bg-stealth-bg/50 backdrop-blur-md border-b border-stealth-border px-6 flex items-center justify-between z-40 sticky top-0">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <div className="text-lg font-bold text-white tracking-tight">
                    StealthPitch
                </div>
            </Link>

            {/* Wallet Connect */}
            <button
                onClick={handleConnect}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${mounted && isConnected
                    ? "bg-stealth-surface border border-stealth-border text-stealth-text"
                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                    }`}
            >
                {mounted && isConnected && address ? (
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-stealth-green animate-pulse" />
                        {formatAddress(address)}
                    </div>
                ) : (
                    "Connect Wallet"
                )}
            </button>
        </header>
    );
}
