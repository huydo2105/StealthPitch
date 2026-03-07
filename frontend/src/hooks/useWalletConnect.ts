import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { formatBalance } from "@/lib/util";
import { etherlinkShadownet } from "@/lib/chains";

export function useWalletConnect() {
    const { address, isConnected, chainId: walletChainId } = useAccount();
    const { connect } = useConnect();
    const { disconnect } = useDisconnect();
    const { switchChain } = useSwitchChain();
    const { data: balanceData } = useBalance({ address });

    const [mounted, setMounted] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const isWrongChain = mounted && isConnected && walletChainId !== etherlinkShadownet.id;

    useEffect(() => {
        setMounted(true);
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (isWrongChain && switchChain) {
            switchChain({ chainId: etherlinkShadownet.id });
        }
    }, [isWrongChain, switchChain]);

    const handleConnect = () => {
        if (isConnected) setIsMenuOpen((o) => !o);
        else connect({ connector: metaMask() });
    };

    const handleCopyAddress = async () => {
        if (!address) return;
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const formattedBalance =
        balanceData && !isWrongChain
            ? `${formatBalance(balanceData.value)} ${balanceData.symbol}`
            : null;

    return {
        address, isConnected, mounted, isWrongChain,
        isMenuOpen, setIsMenuOpen, copied,
        menuRef, handleConnect, handleCopyAddress, formatAddress,
        switchChain, disconnect, formattedBalance,
    };
}
