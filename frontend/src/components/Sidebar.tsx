"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";

const NAV_ITEMS = [
    { href: "/vault", icon: "🔒", label: "Founder Vault" },
    { href: "/chat", icon: "💬", label: "Investor Chat" },
    { href: "/attestation", icon: "🛡️", label: "Attestation" },
];

const sidebarVariants = {
    hidden: { x: -260, opacity: 0 },
    visible: {
        x: 0,
        opacity: 1,
        transition: { type: "spring" as const, stiffness: 300, damping: 30 },
    },
};

export function Sidebar() {
    const pathname = usePathname();
    const [health, setHealth] = useState<{
        status: string;
        has_documents: boolean;
    } | null>(null);

    useEffect(() => {
        checkHealth()
            .then(setHealth)
            .catch(() => setHealth(null));

        const interval = setInterval(() => {
            checkHealth()
                .then(setHealth)
                .catch(() => setHealth(null));
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    return (
        <motion.aside
            variants={sidebarVariants}
            initial="hidden"
            animate="visible"
            className="w-[260px] flex-shrink-0 bg-stealth-surface border-r border-stealth-border flex flex-col h-full"
        >
            {/* Logo */}
            <div className="px-4 py-5">
                <h1 className="text-lg font-semibold text-stealth-text flex items-center gap-2">
                    <span className="text-xl">🔐</span> StealthPitch
                </h1>
            </div>

            {/* Divider */}
            <div className="mx-3 border-t border-stealth-border" />

            {/* Navigation */}
            <nav className="flex-1 px-3 py-3 space-y-0.5">
                {NAV_ITEMS.map((item) => {
                    const isActive =
                        pathname === item.href ||
                        (item.href === "/vault" && pathname === "/");

                    return (
                        <Link key={item.href} href={item.href}>
                            <div className="relative">
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className="absolute inset-0 rounded-lg bg-stealth-hover"
                                        transition={{
                                            type: "spring",
                                            stiffness: 350,
                                            damping: 30,
                                        }}
                                    />
                                )}
                                <div
                                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                        ? "text-stealth-text"
                                        : "text-stealth-muted hover:text-stealth-text hover:bg-stealth-elevated"
                                        }`}
                                >
                                    <span className="text-base">{item.icon}</span>
                                    {item.label}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Divider */}
            <div className="mx-3 border-t border-stealth-border" />

            {/* Runtime Status */}
            <div className="px-3 py-3">
                <p className="text-xs font-medium text-stealth-muted uppercase tracking-wider mb-2 px-1">
                    Runtime
                </p>
                <div className="bg-stealth-elevated rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-block w-2 h-2 rounded-full ${health?.status === "ok"
                                ? "bg-stealth-green pulse-green"
                                : "bg-stealth-red"
                                }`}
                        />
                        <span className="text-sm font-medium text-stealth-text">
                            {health?.status === "ok" ? "Enclave Active" : "Connecting..."}
                        </span>
                    </div>
                    <p className="text-xs text-stealth-muted">AES-256-XTS (TME-MK)</p>
                    <p className="text-xs text-stealth-muted">
                        {health?.has_documents ? "Documents loaded ✓" : "No documents yet"}
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-stealth-border">
                <p className="text-xs text-stealth-muted">
                    StealthPitch v2.0 · Phala dstack
                </p>
            </div>
        </motion.aside>
    );
}
