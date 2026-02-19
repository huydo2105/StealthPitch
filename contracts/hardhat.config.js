require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.20",
    networks: {
        etherlinkTestnet: {
            url: process.env.ETHERLINK_RPC_URL || "https://node.shadownet.etherlink.com",
            chainId: 127823,
            accounts: process.env.DEPLOYER_PRIVATE_KEY
                ? [process.env.DEPLOYER_PRIVATE_KEY]
                : [],
        },
        localhost: {
            url: "http://127.0.0.1:8545",
        },
    },
    paths: {
        sources: "./",           // NDAIEscrow.sol is in the contracts/ root
        artifacts: "./artifacts",
        cache: "./cache",
        tests: "./test",
    },
};
