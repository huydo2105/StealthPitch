/**
 * Shared types for the chat feature.
 */

export interface ChatMessage {
    id?: string;
    role: "user" | "buyer_agent" | "seller_agent" | "system" | "founder" | "investor";
    content: string;
    sources?: string[];
    suggestedPrice?: number;
    signatureVerified?: boolean;
    sender?: string;
}

export const CHAT_VISIBLE_ROLES = [
    "user",
    "assistant",
    "system",
    "founder",
    "investor",
    "buyer_agent",
    "seller_agent",
] as const;
