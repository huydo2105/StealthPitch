import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
    fetchChatMessages,
    fetchChatSessions,
    getDeal,
    subscribeToSessionMessages,
    DealRoom,
    ChatMessageRow,
} from "@/lib/api";
import { ChatMessage, CHAT_VISIBLE_ROLES } from "@/types/chat";

interface UseDealRoomReturn {
    walletAddress: string | undefined;
    dealId: string | null;
    sessionFromQuery: string | null;
    messages: ChatMessage[];
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    sessionId: string | undefined;
    setSessionId: React.Dispatch<React.SetStateAction<string | undefined>>;
    room: DealRoom | null;
    setRoom: React.Dispatch<React.SetStateAction<DealRoom | null>>;
    bottomRef: React.RefObject<HTMLDivElement | null>;
    seenMessageIdsRef: React.RefObject<Set<string>>;
    participantRole: "founder" | "investor" | "member" | undefined;
}

export function useDealRoom(): UseDealRoomReturn {
    const searchParams = useSearchParams();
    const dealId = searchParams.get("deal");
    const sessionFromQuery = searchParams.get("session");
    const { address: walletAddress } = useAccount();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessionId, setSessionId] = useState<string | undefined>();
    const [room, setRoom] = useState<DealRoom | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const seenMessageIdsRef = useRef<Set<string>>(new Set());

    // ── Hydrate messages + resolve room ────────────────────────────────
    useEffect(() => {
        if (!walletAddress) return;

        const hydrateMessages = (targetSessionId: string): Promise<void> =>
            fetchChatMessages(targetSessionId)
                .then((rows: ChatMessageRow[]) => {
                    const visible = rows.filter((r) =>
                        (CHAT_VISIBLE_ROLES as readonly string[]).includes(r.role)
                    );
                    seenMessageIdsRef.current = new Set(visible.map((row) => String(row.id)));
                    setMessages(
                        visible.map((row) => ({
                            id: String(row.id),
                            role: row.role as ChatMessage["role"],
                            content: row.content,
                            sender: row.metadata?.sender as string | undefined,
                            sources: Array.isArray(row.metadata?.sources)
                                ? (row.metadata.sources as string[])
                                : undefined,
                            suggestedPrice: row.metadata?.suggested_price as number | undefined,
                        }))
                    );
                    setSessionId(targetSessionId);
                })
                .catch(() => { });

        fetchChatSessions(walletAddress).then((sessions) => {
            const session = sessions.find((s) => s.id === sessionFromQuery);
            if (session?.deal_room_id) {
                getDeal(session.deal_room_id)
                    .then(setRoom)
                    .catch(() => setRoom(null));
            }
            const sharedSession = sessions.find((s) => s.deal_room_id === dealId);
            if (sharedSession?.id) {
                void hydrateMessages(sharedSession.id);
                return;
            }
        });

        if (sessionFromQuery) {
            void hydrateMessages(sessionFromQuery);
        }
    }, [walletAddress, sessionFromQuery, dealId, sessionId]);

    // ── Supabase realtime subscription ─────────────────────────────────
    useEffect(() => {
        if (!sessionId) return;
        const unsubscribe = subscribeToSessionMessages(sessionId, (row) => {
            if (!(CHAT_VISIBLE_ROLES as readonly string[]).includes(row.role)) return;

            const messageId = String(row.id);
            if (seenMessageIdsRef.current.has(messageId)) return;
            seenMessageIdsRef.current.add(messageId);

            const sources = Array.isArray(row.metadata?.sources)
                ? (row.metadata.sources as string[])
                : undefined;
            const suggestedPrice = row.metadata?.suggested_price as number | undefined;

            setMessages((prev) => {
                const nextMessage: ChatMessage = {
                    id: messageId,
                    role: row.role as ChatMessage["role"],
                    content: row.content,
                    sender: row.metadata?.sender as string | undefined,
                    sources,
                    suggestedPrice,
                };
                const last = prev[prev.length - 1];
                if (last?.role === nextMessage.role && last?.content === nextMessage.content) {
                    return prev;
                }
                return [...prev, nextMessage];
            });
        });
        return unsubscribe;
    }, [sessionId]);

    // ── Auto-scroll ────────────────────────────────────────────────────
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const participantRole =
        room && walletAddress
            ? walletAddress.toLowerCase() === room.seller_address.toLowerCase()
                ? "founder"
                : walletAddress.toLowerCase() === room.buyer_address.toLowerCase()
                    ? "investor"
                    : "member"
            : undefined;

    return {
        walletAddress,
        dealId,
        sessionFromQuery,
        messages,
        setMessages,
        sessionId,
        setSessionId,
        room,
        setRoom,
        bottomRef,
        seenMessageIdsRef,
        participantRole,
    };
}
