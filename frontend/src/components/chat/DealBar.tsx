"use client";

import { motion } from "framer-motion";
import { DealRoom } from "@/lib/api";

interface DealBarProps {
    room: DealRoom;
}

export default function DealBar({ room }: DealBarProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-4 mt-4 p-3 rounded-xl bg-stealth-surface border border-stealth-border flex items-center gap-4 text-xs"
        >
            <div className="flex items-center gap-1.5">
                <span className="text-stealth-muted">Deal</span>
                <span className="font-mono text-stealth-accent">{room.room_id}</span>
            </div>
            <div className="h-4 w-px bg-stealth-border" />
            <div>
                <span className="text-stealth-muted">Threshold:</span>{" "}
                <span className="text-stealth-text">{room.seller_threshold} XTZ</span>
            </div>
            <div>
                <span className="text-stealth-muted">Budget:</span>{" "}
                <span className="text-stealth-text">{room.buyer_budget} XTZ</span>
            </div>
            {room.proposed_price > 0 && (
                <div>
                    <span className="text-stealth-muted">Proposed:</span>{" "}
                    <span
                        className={
                            room.proposed_price >= room.seller_threshold
                                ? "text-stealth-green font-semibold"
                                : "text-stealth-gold font-semibold"
                        }
                    >
                        {room.proposed_price} XTZ
                    </span>
                </div>
            )}
            <div
                className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${room.status === "accepted"
                        ? "bg-stealth-green/10 text-stealth-green"
                        : room.status === "exited"
                            ? "bg-stealth-red/10 text-stealth-red"
                            : "bg-stealth-gold/10 text-stealth-gold"
                    }`}
            >
                {room.status}
            </div>
        </motion.div>
    );
}
