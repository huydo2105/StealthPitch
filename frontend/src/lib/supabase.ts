import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
    if (_client) {
        return _client;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        return null;
    }

    if (typeof window !== "undefined") {
        console.log("[Supabase] Initializing client with URL:", url);
        if (anonKey.split(".").length < 3) {
            console.error("[Supabase] CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY appears truncated! (Expected 3 JWT segments, found " + anonKey.split(".").length + ")");
        } else {
            console.log("[Supabase] API Key verification: OK (JWT segments: " + anonKey.split(".").length + ")");
        }
    }

    _client = createClient(url, anonKey);
    return _client;
}

