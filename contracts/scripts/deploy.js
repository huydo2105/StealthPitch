const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying NDAIEscrow with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // The TEE authority is the same as the deployer for the hackathon demo.
    // In production, this would be a dedicated TEE wallet derived inside the enclave.
    const teeAuthority = process.env.TEE_AUTHORITY_ADDRESS || deployer.address;
    console.log("TEE Authority:", teeAuthority);

    const NDAIEscrow = await ethers.getContractFactory("NDAIEscrow");
    const escrow = await NDAIEscrow.deploy(teeAuthority);
    await escrow.waitForDeployment();

    const address = await escrow.getAddress();
    console.log("NDAIEscrow deployed to:", address);
    console.log("\nAdd this to your backend/.env:");
    console.log(`ESCROW_CONTRACT_ADDRESS=${address}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
