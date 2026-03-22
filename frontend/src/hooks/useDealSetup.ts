import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { createDeal, joinDeal, getDeal, ingestForDeal, listWalletDeals, confirmTx, DealRoom } from "@/lib/api";
import { useCreateDealOnChain, useDepositFunds } from "@/lib/useNDAIEscrow";

type Phase = "setup" | "creating" | "created" | "joining" | "joined" | "error";

export interface UseDealSetupReturn {
    role: "founder" | "investor";
    setRole: (r: "founder" | "investor") => void;
    phase: Phase;
    setPhase: (p: Phase) => void;
    error: string;
    room: DealRoom | null;
    setRoom: (r: DealRoom | null) => void;
    dealHistory: DealRoom[];

    // Founder fields
    sellerAddress: string;
    setSellerAddress: (v: string) => void;
    threshold: string;
    setThreshold: (v: string) => void;

    // Investor fields
    roomIdInput: string;
    setRoomIdInput: (v: string) => void;
    buyerAddress: string;
    setBuyerAddress: (v: string) => void;
    budget: string;
    setBudget: (v: string) => void;

    // File upload
    getRootProps: ReturnType<typeof useDropzone>["getRootProps"];
    getInputProps: ReturnType<typeof useDropzone>["getInputProps"];
    isDragActive: boolean;
    uploadPhase: "idle" | "uploading" | "done";
    uploadMsg: string;

    // Actions
    handleCreateDeal: () => Promise<void>;
    handleJoinDeal: () => Promise<void>;
    refreshRoom: () => Promise<void>;

    // On-chain state
    walletAddress: string | undefined;
    createTxHash: `0x${string}` | undefined;
    isCreateConfirming: boolean;
    isCreateConfirmed: boolean;
    depositTxHash: `0x${string}` | undefined;
    isDepositConfirming: boolean;
    isDepositConfirmed: boolean;
    onChainError: string | null;

    router: ReturnType<typeof useRouter>;
}

export function useDealSetup(): UseDealSetupReturn {
    const { address: walletAddress } = useAccount();
    const router = useRouter();

    const [role, setRole] = useState<"founder" | "investor">("founder");
    const [phase, setPhase] = useState<Phase>("setup");
    const [error, setError] = useState("");
    const [room, setRoom] = useState<DealRoom | null>(null);
    const [dealHistory, setDealHistory] = useState<DealRoom[]>([]);

    const [sellerAddress, setSellerAddress] = useState("");
    const [threshold, setThreshold] = useState("");
    const [roomIdInput, setRoomIdInput] = useState("");
    const [buyerAddress, setBuyerAddress] = useState("");
    const [budget, setBudget] = useState("");
    const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "done">("idle");
    const [uploadMsg, setUploadMsg] = useState("");

    const {
        createDealOnChain,
        isPending: isCreatePending,
        isConfirming: isCreateConfirming,
        isConfirmed: isCreateConfirmed,
        isError: isCreateError,
        error: createError,
        txHash: createTxHash,
    } = useCreateDealOnChain();

    const {
        depositFundsOnChain,
        isPending: isDepositPending,
        isConfirming: isDepositConfirming,
        isConfirmed: isDepositConfirmed,
        isError: isDepositError,
        error: depositError,
        txHash: depositTxHash,
    } = useDepositFunds();

    // Auto-fill wallet
    useEffect(() => {
        if (walletAddress) {
            setSellerAddress(walletAddress);
            setBuyerAddress(walletAddress);
        }
    }, [walletAddress]);

    // Deal history polling
    useEffect(() => {
        if (!walletAddress) { setDealHistory([]); return; }
        const fetch = () => listWalletDeals(walletAddress).then(setDealHistory).catch(() => setDealHistory([]));
        fetch();
        const id = setInterval(fetch, 60000);
        return () => clearInterval(id);
    }, [walletAddress]);

    // On-chain confirmation callbacks
    useEffect(() => {
        if (isCreateConfirmed && createTxHash && room) {
            confirmTx(room.room_id, "create", createTxHash).catch((err) =>
                console.warn("confirm_tx(create) failed:", err)
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCreateConfirmed, createTxHash]);

    useEffect(() => {
        if (isDepositConfirmed && depositTxHash && room) {
            confirmTx(room.room_id, "deposit", depositTxHash)
                .then((updated) => setRoom(updated))
                .catch((err) => console.warn("confirm_tx(deposit) failed:", err));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDepositConfirmed, depositTxHash]);

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            if (!room) return;
            setUploadPhase("uploading");
            try {
                const res = await ingestForDeal(room.room_id, acceptedFiles);
                setUploadMsg(`${res.files_processed} file(s) → ${res.chunks_created} chunks`);
                setRoom(res.room);
                setUploadPhase("done");
            } catch (err) {
                setUploadMsg(err instanceof Error ? err.message : "Upload failed");
                setUploadPhase("idle");
            }
        },
        [room]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    });

    const handleCreateDeal = async () => {
        if (!sellerAddress || !threshold) { setError("Please fill in all fields"); return; }
        setPhase("creating");
        setError("");
        try {
            const deal = await createDeal(sellerAddress, parseFloat(threshold));
            setRoom(deal);
            if (walletAddress) {
                await createDealOnChain(deal.room_id, sellerAddress as `0x${string}`, parseFloat(threshold))
                    .catch((err) => console.warn("On-chain createDeal failed:", err));
            }
            setPhase("created");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create deal");
            setPhase("error");
        }
    };

    const handleJoinDeal = async () => {
        if (!roomIdInput || !buyerAddress || !budget) { setError("Please fill in all fields"); return; }
        setPhase("joining");
        setError("");
        try {
            const deal = await joinDeal(roomIdInput, buyerAddress, parseFloat(budget));
            setRoom(deal);
            if (walletAddress) {
                const tx = await depositFundsOnChain(deal.room_id, parseFloat(budget));
                if (!tx) {
                    throw new Error("Transaction rejected or failed to start.");
                }
            }
            setPhase("joined");
        } catch (err) {
            console.error("Join Deal error:", err);
            setError(err instanceof Error ? err.message : "Failed to join deal");
            setPhase("setup"); // Revert to setup on failure so they can retry
        }
    };

    const refreshRoom = async () => {
        if (!room) return;
        try { setRoom(await getDeal(room.room_id)); } catch { /* silent */ }
    };

    const onChainError = isCreateError
        ? (createError?.message ?? null)
        : isDepositError
            ? (depositError?.message ?? null)
            : null;

    // Suppress unused lint warnings for pending booleans (used by callers if needed)
    void isCreatePending;
    void isDepositPending;

    return {
        role, setRole, phase, setPhase, error, room, setRoom, dealHistory,
        sellerAddress, setSellerAddress, threshold, setThreshold,
        roomIdInput, setRoomIdInput, buyerAddress, setBuyerAddress, budget, setBudget,
        getRootProps, getInputProps, isDragActive,
        uploadPhase, uploadMsg,
        handleCreateDeal, handleJoinDeal, refreshRoom,
        walletAddress, createTxHash, isCreateConfirming, isCreateConfirmed,
        depositTxHash, isDepositConfirming, isDepositConfirmed, onChainError,
        router,
    };
}
