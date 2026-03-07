"""
StealthPitch — Blockchain Bridge
=================================
Web3.py wrapper for interacting with the NDAIEscrow smart contract
on Etherlink Testnet (Chain ID: 128123).
"""

import json
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ETHERLINK_RPC = os.getenv("ETHERLINK_RPC_URL", "https://node.shadownet.etherlink.com")
ETHERLINK_CHAIN_ID = 127823
ESCROW_CONTRACT_ADDRESS = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
TEE_PRIVATE_KEY = os.getenv("TEE_PRIVATE_KEY", "")
EXPLORER_URL = "https://shadownet.explorer.etherlink.com/"


def _load_abi() -> list:
    """Load the NDAIEscrow ABI from the Hardhat artifacts."""
    backend_root = Path(__file__).resolve().parents[2]
    artifact_path = backend_root / "app" / "abis" / "NDAIEscrow.json"
    if artifact_path.exists():
        with open(artifact_path, encoding="utf-8") as file:
            data = json.load(file)
            # Support both a raw ABI array and a Hardhat artifact object
            if isinstance(data, list):
                return data
            return data.get("abi", [])
    logger.warning("NDAIEscrow ABI not found at %s", artifact_path)
    return []

DEAL_STATUS_MAP = {
    0: "Created",
    1: "Funded",
    2: "Accepted",
    3: "Exited",
    4: "Cancelled",
}


class BlockchainClient:
    """Wrapper for NDAIEscrow contract interactions."""

    def __init__(self) -> None:
        self._w3 = None
        self._contract = None
        self._account = None
        self._initialized = False

    def _ensure_init(self) -> None:
        if self._initialized:
            return
        try:
            from web3 import Web3

            self._w3 = Web3(Web3.HTTPProvider(ETHERLINK_RPC))
            if not ESCROW_CONTRACT_ADDRESS:
                logger.warning("ESCROW_CONTRACT_ADDRESS not set — blockchain features disabled")
                return

            abi = _load_abi()
            self._contract = self._w3.eth.contract(
                address=Web3.to_checksum_address(ESCROW_CONTRACT_ADDRESS),
                abi=abi,
            )

            if TEE_PRIVATE_KEY:
                self._account = self._w3.eth.account.from_key(TEE_PRIVATE_KEY)
                logger.info("Blockchain client initialized. TEE wallet: %s", self._account.address)
            else:
                logger.warning("TEE_PRIVATE_KEY not set — read-only mode")

            self._initialized = True
        except ImportError:
            logger.warning("web3 not installed — blockchain features disabled")
        except Exception as exc:
            logger.error("Blockchain init failed: %s", exc)

    @property
    def is_available(self) -> bool:
        self._ensure_init()
        return self._contract is not None

    @property
    def explorer_url(self) -> str:
        return EXPLORER_URL

    def _deal_id_to_bytes32(self, deal_id: str) -> bytes:
        """Convert a string deal ID to bytes32."""
        from web3 import Web3

        return Web3.keccak(text=deal_id)

    def _send_tx(self, tx_func, value: int = 0) -> dict:
        """Build, sign, and send a transaction."""
        if not self._account:
            raise RuntimeError("TEE_PRIVATE_KEY not configured")

        tx = tx_func.build_transaction(
            {
                "from": self._account.address,
                "nonce": self._w3.eth.get_transaction_count(self._account.address),
                "gas": 300000,
                "gasPrice": self._w3.eth.gas_price,
                "chainId": ETHERLINK_CHAIN_ID,
                "value": value,
            }
        )

        signed = self._w3.eth.account.sign_transaction(tx, TEE_PRIVATE_KEY)
        tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return {
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "status": "success" if receipt.status == 1 else "failed",
            "explorer_link": f"{EXPLORER_URL}/tx/0x{receipt.transactionHash.hex()}",
        }

    def create_deal_onchain(self, deal_id: str, seller_address: str, threshold_wei: int) -> dict:
        """Create a deal on the smart contract."""
        self._ensure_init()
        if not self.is_available:
            return {"status": "simulated", "message": "Blockchain not configured — simulated"}
        from web3 import Web3

        deal_id_bytes = self._deal_id_to_bytes32(deal_id)
        seller = Web3.to_checksum_address(seller_address)
        tx_func = self._contract.functions.createDeal(deal_id_bytes, seller, threshold_wei)
        return self._send_tx(tx_func)

    def deposit_funds(self, deal_id: str, amount_wei: int) -> dict:
        """Deposit funds to escrow for a deal."""
        self._ensure_init()
        if not self.is_available:
            return {"status": "simulated", "message": "Blockchain not configured — simulated"}
        deal_id_bytes = self._deal_id_to_bytes32(deal_id)
        tx_func = self._contract.functions.depositFunds(deal_id_bytes)
        return self._send_tx(tx_func, value=amount_wei)

    def accept_deal_onchain(self, deal_id: str, agreed_price_wei: int) -> dict:
        """TEE accepts the deal — pays seller, refunds excess."""
        self._ensure_init()
        if not self.is_available:
            return {"status": "simulated", "message": "Blockchain not configured — simulated"}
        deal_id_bytes = self._deal_id_to_bytes32(deal_id)
        tx_func = self._contract.functions.acceptDeal(deal_id_bytes, agreed_price_wei)
        return self._send_tx(tx_func)

    def exit_deal_onchain(self, deal_id: str) -> dict:
        """TEE exits the deal — full refund to investor."""
        self._ensure_init()
        if not self.is_available:
            return {"status": "simulated", "message": "Blockchain not configured — simulated"}
        deal_id_bytes = self._deal_id_to_bytes32(deal_id)
        tx_func = self._contract.functions.exitDeal(deal_id_bytes)
        return self._send_tx(tx_func)

    def get_deal_onchain(self, deal_id: str) -> Optional[dict]:
        """Read deal state from the contract."""
        self._ensure_init()
        if not self.is_available:
            return None
        deal_id_bytes = self._deal_id_to_bytes32(deal_id)
        try:
            deal = self._contract.functions.getDeal(deal_id_bytes).call()
            return {
                "deal_id": deal[0].hex(),
                "seller": deal[1],
                "buyer": deal[2],
                "threshold": deal[3],
                "budget_cap": deal[4],
                "deposited_amount": deal[5],
                "agreed_price": deal[6],
                "status": DEAL_STATUS_MAP.get(deal[7], "Unknown"),
                "created_at": deal[8],
                "settled_at": deal[9],
            }
        except Exception as exc:
            logger.error("Failed to read deal from chain: %s", exc)
            return None


blockchain = BlockchainClient()

