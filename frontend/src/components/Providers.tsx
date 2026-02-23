'use client';

import { WagmiProvider, createConfig, http } from 'wagmi';
import { etherlinkShadownet } from '@/lib/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
    const [config] = useState(() =>
        createConfig({
            chains: [etherlinkShadownet],
            transports: {
                [etherlinkShadownet.id]: http(),
            },
        })
    );

    const [queryClient] = useState(() => new QueryClient());

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
    );
}
