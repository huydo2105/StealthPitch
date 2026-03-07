import { DealRoom } from "@/lib/api";
import { motion } from "framer-motion";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const STATUS_COLORS: Record<string, string> = {
    created: "bg-stealth-gold/10 text-stealth-gold",
    funded: "bg-stealth-accent/10 text-stealth-accent",
    negotiating: "bg-stealth-accent/10 text-stealth-accent",
    accepted: "bg-stealth-green/10 text-stealth-green",
    exited: "bg-stealth-red/10 text-stealth-red",
    cancelled: "bg-stealth-muted/10 text-stealth-muted",
};

export function DealHistorySection({ deals, router }: { deals: DealRoom[]; router: AppRouterInstance }) {
    if (deals.length === 0) return null;
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-xl bg-stealth-surface border border-stealth-border space-y-3"
        >
            <h3 className="text-xs font-semibold text-stealth-muted uppercase tracking-wide">Deal History</h3>
            {deals.map((deal) => (
                <div
                    key={deal.room_id}
                    className="p-3 rounded-lg bg-stealth-bg border border-stealth-border flex items-center gap-3 text-xs"
                >
                    <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-stealth-accent">{deal.room_id}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLORS[deal.status] ?? ""}`}>
                                {deal.status}
                            </span>
                        </div>
                        <div className="flex gap-4 text-stealth-muted">
                            <span>Threshold: {deal.seller_threshold} XTZ</span>
                            {deal.buyer_budget > 0 && <span>Budget: {deal.buyer_budget} XTZ</span>}
                            {deal.proposed_price > 0 && <span className="text-stealth-text">Price: {deal.proposed_price} XTZ</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => router.push(`/chat?session=${deal.session_id}&deal=${deal.room_id}`)}
                        className="px-3 py-1.5 rounded-md bg-stealth-hover text-stealth-text hover:bg-stealth-accent/10 hover:text-stealth-accent transition-colors whitespace-nowrap"
                    >
                        View Chat →
                    </button>
                </div>
            ))}
        </motion.div>
    );
}
