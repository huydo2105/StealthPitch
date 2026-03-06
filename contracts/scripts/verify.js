/**
 * verify.js — Verify NDAIEscrow on Etherlink Shadownet block explorer
 *
 * Usage:
 *   npx hardhat run scripts/verify.js --network etherlinkTestnet
 *
 * Requires:
 *   - CONTRACT_ADDRESS in .env  (the deployed NDAIEscrow address)
 *   - TEE_AUTHORITY_ADDRESS in .env  (constructor arg; defaults to deployer)
 *   - DEPLOYER_PRIVATE_KEY in .env   (used to derive deployer address as fallback)
 */

const hre = require("hardhat");

async function main() {
    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!contractAddress) {
        console.error("❌  Set CONTRACT_ADDRESS in your .env file first.");
        console.error("    Example: CONTRACT_ADDRESS=0xF3E699115904D8DbBc0202Eb24FBd6aD8d9b9ae7");
        process.exit(1);
    }

    // Resolve the TEE authority (same logic as deploy.js)
    const [deployer] = await hre.ethers.getSigners();
    const teeAuthority = process.env.TEE_AUTHORITY_ADDRESS || deployer.address;

    console.log("🔍  Verifying NDAIEscrow...");
    console.log("    Contract :", contractAddress);
    console.log("    TEE Auth :", teeAuthority);
    console.log("    Network  :", hre.network.name);

    try {
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [teeAuthority],
        });
        console.log("✅  Contract verified successfully!");
    } catch (error) {
        if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
            console.log("ℹ️   Contract is already verified.");
        } else {
            console.error("❌  Verification failed:", error.message);
            process.exit(1);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
