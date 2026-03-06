/**
 * useNDAIEscrow — wagmi hook for NDAIEscrow on Etherlink
 *
 * Contract: 0xF3E699115904D8DbBc0202Eb24FBd6aD8d9b9ae7
 * Network:  Etherlink Shadownet (chainId 127823)
 *
 * Exposes:
 *  - createDealOnChain(dealId, sellerAddress, thresholdXTZ)
 *  - depositFundsOnChain(dealId, amountXTZ)
 *  - acceptDealOnChain(dealId, agreedPriceXTZ)   [TEE authority only]
 *  - exitDealOnChain(dealId)                      [TEE authority only]
 *  - getDealOnChain(dealId)                       [read]
 *
 * All XTZ amounts are passed as JS floats (e.g. 5.0) and converted to wei here.
 */

import {
    useWriteContract,
    useReadContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, toBytes, pad, keccak256, toHex } from "viem";
import { etherlinkShadownet } from "./chains";

// ── Contract config ───────────────────────────────────────────────────

export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL;

export const NDAI_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}`;

export const NDAI_ESCROW_ABI = [
    // createDeal(bytes32 _dealId, address payable _seller, uint256 _threshold)
    {
        name: "createDeal",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "_dealId", type: "bytes32" },
            { name: "_seller", type: "address" },
            { name: "_threshold", type: "uint256" },
        ],
        outputs: [],
    },
    // depositFunds(bytes32 _dealId) payable
    {
        name: "depositFunds",
        type: "function",
        stateMutability: "payable",
        inputs: [{ name: "_dealId", type: "bytes32" }],
        outputs: [],
    },
    // acceptDeal(bytes32 _dealId, uint256 _agreedPrice)  [onlyTEE]
    {
        name: "acceptDeal",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "_dealId", type: "bytes32" },
            { name: "_agreedPrice", type: "uint256" },
        ],
        outputs: [],
    },
    // exitDeal(bytes32 _dealId)  [onlyTEE]
    {
        name: "exitDeal",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "_dealId", type: "bytes32" }],
        outputs: [],
    },
    // cancelDeal(bytes32 _dealId)
    {
        name: "cancelDeal",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [{ name: "_dealId", type: "bytes32" }],
        outputs: [],
    },
    // getDeal(bytes32 _dealId) view returns (Deal)
    {
        name: "getDeal",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "_dealId", type: "bytes32" }],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    { name: "dealId", type: "bytes32" },
                    { name: "seller", type: "address" },
                    { name: "buyer", type: "address" },
                    { name: "threshold", type: "uint256" },
                    { name: "budgetCap", type: "uint256" },
                    { name: "depositedAmount", type: "uint256" },
                    { name: "agreedPrice", type: "uint256" },
                    { name: "status", type: "uint8" },
                    { name: "createdAt", type: "uint256" },
                    { name: "settledAt", type: "uint256" },
                ],
            },
        ],
    },
    // getDealStatus(bytes32 _dealId) view returns (uint8)
    {
        name: "getDealStatus",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "_dealId", type: "bytes32" }],
        outputs: [{ name: "", type: "uint8" }],
    },
    // Events
    {
        name: "DealCreated",
        type: "event",
        inputs: [
            { name: "dealId", type: "bytes32", indexed: true },
            { name: "seller", type: "address", indexed: true },
            { name: "threshold", type: "uint256", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false },
        ],
    },
    {
        name: "FundsDeposited",
        type: "event",
        inputs: [
            { name: "dealId", type: "bytes32", indexed: true },
            { name: "buyer", type: "address", indexed: true },
            { name: "amount", type: "uint256", indexed: false },
            { name: "budgetCap", type: "uint256", indexed: false },
        ],
    },
    {
        name: "DealAccepted",
        type: "event",
        inputs: [
            { name: "dealId", type: "bytes32", indexed: true },
            { name: "seller", type: "address", indexed: true },
            { name: "buyer", type: "address", indexed: true },
            { name: "agreedPrice", type: "uint256", indexed: false },
            { name: "refundedExcess", type: "uint256", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false },
        ],
    },
    {
        name: "DealExited",
        type: "event",
        inputs: [
            { name: "dealId", type: "bytes32", indexed: true },
            { name: "buyer", type: "address", indexed: true },
            { name: "refundedAmount", type: "uint256", indexed: false },
            { name: "timestamp", type: "uint256", indexed: false },
        ],
    },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────

/** Convert a backend room_id string to a bytes32 hex for the contract */
export function roomIdToBytes32(roomId: string): `0x${string}` {
    // If it's already a 0x hex, pad to 32 bytes
    if (roomId.startsWith("0x")) {
        return pad(roomId as `0x${string}`, { size: 32 });
    }
    // Otherwise hash the string to produce a deterministic bytes32
    return keccak256(toHex(toBytes(roomId)));
}

/** Explorer base URL */
export const ETHERLINK_EXPLORER = "https://shadownet.explorer.etherlink.com";

export function explorerTxUrl(txHash: string): string {
    return `${ETHERLINK_EXPLORER}/tx/${txHash}`;
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
    const {
        writeContractAsync,
        isPending,
        isError,
        error,
        data: txHash,
        reset,
    } = useWriteContract();

    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({ hash: txHash, chainId: etherlinkShadownet.id });

    async function createDealOnChain(
        roomId: string,
        sellerAddress: `0x${string}`,
        thresholdXTZ: number
    ) {
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
    const {
        writeContractAsync,
        isPending,
        isError,
        error,
        data: txHash,
        reset,
    } = useWriteContract();

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
