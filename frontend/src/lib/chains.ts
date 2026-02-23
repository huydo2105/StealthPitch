import { defineChain } from "viem";

export const etherlinkShadownet = defineChain({
    id: 127823,
    name: "Etherlink Shadownet",
    nativeCurrency: {
        decimals: 18,
        name: "Tezos",
        symbol: "XTZ",
    },
    rpcUrls: {
        default: {
            http: ["https://node.shadownet.etherlink.com"],
        },
    },
    blockExplorers: {
        default: {
            name: "Etherlink Shadownet Explorer",
            url: "https://shadownet.explorer.etherlink.com",
        },
    },
    testnet: true,
});
