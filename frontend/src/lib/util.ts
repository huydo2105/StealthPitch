import { formatEther } from "viem";

/**
 * Formats a balance from Wei (10^18) format to a readable string with a fixed number of decimals.
 * @param value The balance in Wei (BigInt)
 * @param decimals Optional number of decimal places to show (default: 4)
 * @returns Formatted balance string
 */
export function formatBalance(value: bigint | string | number | undefined | null, decimals: number = 4): string {
    if (value === undefined || value === null) return Number(0).toFixed(decimals);

    try {
        // Convert to BigInt if it's not already
        const bigIntValue = BigInt(value);
        const etherStr = formatEther(bigIntValue);
        const num = Number(etherStr);
        return isNaN(num) ? Number(0).toFixed(decimals) : num.toFixed(decimals);
    } catch (e) {
        console.error("Error formatting balance:", e);
        return Number(0).toFixed(decimals);
    }
}
