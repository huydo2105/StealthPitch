"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { checkHealth } from "@/lib/api";

const navItems = [
    { href: "/", label: "Home", icon: "🏠", desc: "NDAI Overview" },
    { href: "/deal", label: "Deal Room", icon: "🤝", desc: "Create or Join" },
    { href: "/vault", label: "Vault", icon: "📁", desc: "Upload Documents" },
    { href: "/chat", label: "Chat", icon: "💬", desc: "AI Negotiation" },
    { href: "/attestation", label: "Attestation", icon: "🔐", desc: "TEE Proof" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [status, setStatus] = useState<{
        ok: boolean;
        docs: boolean;
        deals: number;
    }>({ ok: false, docs: false, deals: 0 });

    useEffect(() => {
        const poll = () =>
            checkHealth()
                .then((h) =>
                    setStatus({ ok: true, docs: h.has_documents, deals: h.active_deals })
                )
                .catch(() => setStatus((s) => ({ ...s, ok: false })));
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, []);

    return (
        <aside className="w-56 h-screen sticky top-0 flex flex-col bg-stealth-surface border-r border-stealth-border">
            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 mt-4">
                {navItems.map((item) => {
                    if (item.href === "/") return null; // Skip Home
                    const isActive = pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                                ? "text-stealth-accent"
                                : "text-stealth-muted hover:text-stealth-text hover:bg-stealth-hover"
                                }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute inset-0 bg-stealth-accent/8 border border-stealth-accent/15 rounded-lg"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                />
                            )}
                            <span className="relative text-base">{item.icon}</span>
                            <div className="relative">
                                <span className="font-medium">{item.label}</span>
                                {isActive && (
                                    <span className="block text-[10px] text-stealth-muted">
                                        {item.desc}
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Status Footer */}
            <div className="px-4 py-3 border-t border-stealth-border space-y-2">
                {/* Enclave Status */}
                <div className="flex items-center gap-2">
                    <div
                        className={`w-1.5 h-1.5 rounded-full ${status.ok ? "bg-stealth-green animate-pulse" : "bg-stealth-red"
                            }`}
                    />
                    <span className="text-[11px] text-stealth-muted">
                        {status.ok ? "Enclave Active" : "Connecting…"}
                    </span>
                </div>

                {/* Documents */}
                <div className="flex items-center gap-2">
                    <div
                        className={`w-1.5 h-1.5 rounded-full ${status.docs ? "bg-stealth-accent" : "bg-stealth-border"
                            }`}
                    />
                    <span className="text-[11px] text-stealth-muted">
                        {status.docs ? "Documents Loaded" : "No Documents"}
                    </span>
                </div>

                {/* Active Deals */}
                {status.deals > 0 && (
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-stealth-gold animate-pulse" />
                        <span className="text-[11px] text-stealth-muted">
                            {status.deals} Active Deal{status.deals > 1 ? "s" : ""}
                        </span>
                    </div>
                )}
            </div>
        </aside>
    );
}
