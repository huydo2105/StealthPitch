"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Header() {
    const { address, isConnected } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const [mounted, setMounted] = useState(false);

    // Dropdown state
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleConnect = () => {
        if (isConnected) {
            setIsMenuOpen(!isMenuOpen);
        } else {
            connect({ connector: metaMask() });
        }
    };

    const handleCopyAddress = async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return (
        <header className="shrink-0 h-16 bg-stealth-bg/50 backdrop-blur-md border-b border-stealth-border px-6 flex items-center justify-between z-40 sticky top-0">
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

            <div className="relative" ref={menuRef}>
                <button
                    onClick={handleConnect}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${mounted && isConnected
                        ? "bg-stealth-surface border border-stealth-border text-stealth-text hover:bg-stealth-hover"
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                        }`}
                >
                    {mounted && isConnected && address ? (
                        <>
                            <div className="w-2 h-2 rounded-full bg-stealth-green animate-pulse" />
                            {formatAddress(address)}
                            <svg className={`w-4 h-4 ml-1 transition-transform ${isMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </>
                    ) : (
                        "Connect Wallet"
                    )}
                </button>

                <AnimatePresence>
                    {isMenuOpen && mounted && isConnected && address && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-56 rounded-xl bg-stealth-surface border border-stealth-border shadow-2xl py-2 z-50 overflow-hidden"
                        >
                            <div className="px-4 py-3 border-b border-stealth-border/50">
                                <span className="text-[10px] text-stealth-muted uppercase tracking-wider font-semibold block mb-1">
                                    Connected Wallet
                                </span>
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-sm text-stealth-text" title={address}>
                                        {formatAddress(address)}
                                    </span>
                                    <button
                                        onClick={handleCopyAddress}
                                        className="p-1.5 rounded-md hover:bg-stealth-bg text-stealth-muted hover:text-stealth-accent transition-colors"
                                        title="Copy address"
                                    >
                                        {copied ? (
                                            <svg className="w-4 h-4 text-stealth-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="pt-1">
                                <button
                                    onClick={() => {
                                        disconnect();
                                        setIsMenuOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-stealth-red hover:bg-stealth-red/10 transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Disconnect
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
}
