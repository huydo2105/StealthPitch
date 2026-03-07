import { useOnChainDeal, NDAI_ESCROW_ADDRESS, DealStatusLabel } from "@/lib/useNDAIEscrow";
import { formatEther } from "viem";

export function OnChainPanel({ roomId }: { roomId: string }) {
    const { data, isLoading, error } = useOnChainDeal(roomId);

    if (isLoading) {
        return (
            <div className="text-xs text-stealth-muted text-center py-2 animate-pulse">
                Reading on-chain state…
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="text-xs text-stealth-muted text-center py-2">
                📭 Not yet registered on-chain
            </div>
        );
    }

    const deal = data as {
        seller: string;
        buyer: string;
        threshold: bigint;
        budgetCap: bigint;
        depositedAmount: bigint;
        agreedPrice: bigint;
        status: number;
    };

    const statusLabel = DealStatusLabel[deal.status] ?? `Status ${deal.status}`;
    const statusClass =
        deal.status === 2
            ? "text-stealth-green"
            : deal.status === 3
                ? "text-stealth-red"
                : deal.status === 1
                    ? "text-stealth-accent"
                    : "text-stealth-gold";

    return (
        <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-stealth-muted font-semibold uppercase tracking-wide">On-Chain State</span>
                <a
                    href={`https://shadownet.explorer.etherlink.com/address/${NDAI_ESCROW_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stealth-accent hover:underline"
                >
                    ↗ Escrow Contract
                </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <span className="text-stealth-muted">Status</span>
                    <div className={`font-semibold uppercase ${statusClass}`}>{statusLabel}</div>
                </div>
                <div>
                    <span className="text-stealth-muted">Threshold</span>
                    <div className="text-stealth-text">{formatEther(deal.threshold)} XTZ</div>
                </div>
                {deal.budgetCap > 0n && (
                    <div>
                        <span className="text-stealth-muted">Budget Cap</span>
                        <div className="text-stealth-text">{formatEther(deal.budgetCap)} XTZ</div>
                    </div>
                )}
                {deal.depositedAmount > 0n && (
                    <div>
                        <span className="text-stealth-muted">Escrowed</span>
                        <div className="text-stealth-accent font-semibold">{formatEther(deal.depositedAmount)} XTZ</div>
                    </div>
                )}
                {deal.agreedPrice > 0n && (
                    <div className="col-span-2">
                        <span className="text-stealth-muted">Settled Price</span>
                        <div className="text-stealth-green font-semibold">{formatEther(deal.agreedPrice)} XTZ</div>
                    </div>
                )}
            </div>
        </div>
    );
}
