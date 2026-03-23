'use client';

import { useAccount, useBalance } from 'wagmi';
import { etherlinkShadownet } from '@/lib/chains';
import { useEffect, useState } from 'react';

export default function FaucetBanner() {
    const { address, isConnected, chainId } = useAccount();
    const { data: balanceData } = useBalance({
        address,
        chainId: etherlinkShadownet.id,
        query: {
            enabled: isConnected && chainId === etherlinkShadownet.id,
        }
    });

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Wait until mounted to avoid hydration mismatch
    if (!mounted) return null;

    const isShadownet = chainId === etherlinkShadownet.id;
    // Show banner if balance is less than 0.01 XTZ (10^16 wei)
    const hasLowBalance = balanceData ? balanceData.value < 10000000000000000n : false;

    if (!isConnected || !isShadownet || !hasLowBalance) {
        return null;
    }

    return (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-500 px-4 py-2 text-sm flex items-center justify-center gap-2 w-full z-50 transition-all duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>
                You have low or no XTZ on Etherlink Shadownet. Get some testnet tokens from the{' '}
                <a 
                    href="https://shadownet.faucet.etherlink.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-400 font-semibold"
                >
                    Shadownet Faucet
                </a>
                {' '}to interact with the dApp.
            </span>
        </div>
    );
}
