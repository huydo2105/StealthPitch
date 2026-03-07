/**
 * useNDAIEscrow — wagmi hook for NDAIEscrow on Etherlink
 *
 * Contract: 0xF3E699115904D8DbBc0202Eb24FBd6aD8d9b9ae7
 * Network:  Etherlink Shadownet (chainId 127823)
 *
 * Exposes:
 *  - createDealOnChain(dealId, sellerAddress, thresholdXTZ)
 *  - depositFundsOnChain(dealId, amountXTZ)
 *  - cancelDealOnChain(dealId)                     [seller / owner only, pre-funding]
 *  - acceptDealOnChain(dealId, agreedPriceXTZ)     [TEE authority only – via backend]
 *  - exitDealOnChain(dealId)                       [TEE authority only – via backend]
 *  - getDealOnChain(dealId)                        [read]
 *
 * All XTZ amounts are passed as JS floats (e.g. 5.0) and converted to wei here.
 *
 * ⚠️  acceptDeal / exitDeal are onlyTEE on Solidity.
 *     The seller / investor CANNOT call them directly from MetaMask.
 *     Instead, call the backend endpoints /api/deal/{id}/accept or /exit,
 *     which use the TEE private key to send the on-chain tx.
 *     The hooks below are kept for completeness / admin tooling only.
 */

import {
    useWriteContract,
    useReadContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, toBytes, pad, keccak256, toHex } from "viem";
import { etherlinkShadownet } from "./chains";
import { NDAI_ESCROW_ABI } from "../abis/NDAI_ESCROW";

// ── Contract config ───────────────────────────────────────────────────

export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL;

export const NDAI_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}`;


// ── Helpers ───────────────────────────────────────────────────────────

/** Convert a backend room_id string to a bytes32 hex for the contract */
export function roomIdToBytes32(roomId: string): `0x${string}` {
    if (roomId.startsWith("0x")) {
        return pad(roomId as `0x${string}`, { size: 32 });
    }
    return keccak256(toHex(toBytes(roomId)));
}

export function explorerTxUrl(txHash: string): string {
    return `${EXPLORER_URL}/tx/${txHash}`;
}

// ── Deal status enum (mirrors Solidity) ──────────────────────────────
export const DealStatusLabel: Record<number, string> = {
    0: "Created",
    1: "Funded",
    2: "Accepted",
    3: "Exited",
    4: "Cancelled",
};

// ── Write hooks ───────────────────────────────────────────────────────

/** Hook: founder creates deal on-chain */
export function useCreateDealOnChain() {
    const { writeContractAsync, isPending, isError, error, data: txHash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function createDealOnChain(roomId: string, sellerAddress: `0x${string}`, thresholdXTZ: number) {
        const dealId = roomIdToBytes32(roomId);
        return writeContractAsync({
            address: NDAI_ESCROW_ADDRESS,
            abi: NDAI_ESCROW_ABI,
            functionName: "createDeal",
            args: [dealId, sellerAddress, parseEther(String(thresholdXTZ))],
            chainId: etherlinkShadownet.id,
        });
    }

    return { createDealOnChain, isPending, isConfirming, isConfirmed, isError, error, txHash, reset };
}

/** Hook: investor deposits funds on-chain */
export function useDepositFunds() {
    const { writeContractAsync, isPending, isError, error, data: txHash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function depositFundsOnChain(roomId: string, amountXTZ: number) {
        const dealId = roomIdToBytes32(roomId);
        return writeContractAsync({
            address: NDAI_ESCROW_ADDRESS,
            abi: NDAI_ESCROW_ABI,
            functionName: "depositFunds",
            args: [dealId],
            value: parseEther(String(amountXTZ)),
            chainId: etherlinkShadownet.id,
        });
    }

    return { depositFundsOnChain, isPending, isConfirming, isConfirmed, isError, error, txHash, reset };
}

/**
 * Hook: seller (or owner) cancels a deal that is still in "Created" state.
 * This is a DIRECT wallet transaction — no TEE key needed.
 * The seller signs this themselves from MetaMask.
 */
export function useCancelDeal() {
    const { writeContractAsync, isPending, isError, error, data: txHash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function cancelDealOnChain(roomId: string) {
        const dealId = roomIdToBytes32(roomId);
        return writeContractAsync({
            address: NDAI_ESCROW_ADDRESS,
            abi: NDAI_ESCROW_ABI,
            functionName: "cancelDeal",
            args: [dealId],
            chainId: etherlinkShadownet.id,
        });
    }

    return { cancelDealOnChain, isPending, isConfirming, isConfirmed, isError, error, txHash, reset };
}

/**
 * Hook: TEE backend accepts the deal on-chain (onlyTEE modifier).
 * ⚠️  Calling this from MetaMask will FAIL unless the connected wallet IS the TEE authority.
 *     In the normal user flow, use POST /api/deal/{id}/accept — the backend holds the TEE key.
 */
export function useAcceptDealOnChain() {
    const { writeContractAsync, isPending, isError, error, data: txHash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function acceptDealOnChain(roomId: string, agreedPriceXTZ: number) {
        const dealId = roomIdToBytes32(roomId);
        return writeContractAsync({
            address: NDAI_ESCROW_ADDRESS,
            abi: NDAI_ESCROW_ABI,
            functionName: "acceptDeal",
            args: [dealId, parseEther(String(agreedPriceXTZ))],
            chainId: etherlinkShadownet.id,
        });
    }

    return { acceptDealOnChain, isPending, isConfirming, isConfirmed, isError, error, txHash, reset };
}

/**
 * Hook: TEE backend exits the deal on-chain (onlyTEE modifier).
 * ⚠️  Calling this from MetaMask will FAIL unless the connected wallet IS the TEE authority.
 *     In the normal user flow, use POST /api/deal/{id}/exit — the backend holds the TEE key.
 */
export function useExitDealOnChain() {
    const { writeContractAsync, isPending, isError, error, data: txHash, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function exitDealOnChain(roomId: string) {
        const dealId = roomIdToBytes32(roomId);
        return writeContractAsync({
            address: NDAI_ESCROW_ADDRESS,
            abi: NDAI_ESCROW_ABI,
            functionName: "exitDeal",
            args: [dealId],
            chainId: etherlinkShadownet.id,
        });
    }

    return { exitDealOnChain, isPending, isConfirming, isConfirmed, isError, error, txHash, reset };
}

/** Hook: read on-chain deal state */
export function useOnChainDeal(roomId: string | null) {
    const dealId = roomId ? roomIdToBytes32(roomId) : undefined;

    return useReadContract({
        address: NDAI_ESCROW_ADDRESS,
        abi: NDAI_ESCROW_ABI,
        functionName: "getDeal",
        args: dealId ? [dealId] : undefined,
        chainId: etherlinkShadownet.id,
        query: { enabled: !!dealId, refetchInterval: 15000 },
    });
}
