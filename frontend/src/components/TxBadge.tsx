import { explorerTxUrl } from "@/lib/useNDAIEscrow";

export function TxBadge({
    txHash,
    isConfirming,
    isConfirmed,
    label,
}: {
    txHash?: string;
    isConfirming: boolean;
    isConfirmed: boolean;
    label: string;
}) {
    if (!txHash) return null;
    return (
        <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-stealth-surface border border-stealth-border mt-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConfirmed ? "bg-stealth-green" : isConfirming ? "bg-stealth-gold animate-pulse" : "bg-stealth-accent animate-pulse"}`} />
            <span className="text-stealth-muted">{isConfirmed ? `✓ ${label}` : isConfirming ? "Confirming…" : "Pending…"}</span>
            <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-stealth-accent hover:underline font-mono truncate max-w-[120px]"
            >
                {txHash.slice(0, 8)}…{txHash.slice(-6)} ↗
            </a>
        </div>
    );
}
