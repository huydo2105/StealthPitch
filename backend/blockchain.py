"""
StealthPitch — Blockchain Bridge
=================================
Web3.py wrapper for interacting with the NDAIEscrow smart contract
on Etherlink Testnet (Chain ID: 128123).
"""

import os
import json
import logging
from typing import Optional
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────

ETHERLINK_RPC = os.getenv("ETHERLINK_RPC_URL", "https://node.shadownet.etherlink.com")
ETHERLINK_CHAIN_ID = 127823
ESCROW_CONTRACT_ADDRESS = os.getenv("ESCROW_CONTRACT_ADDRESS", "")
TEE_PRIVATE_KEY = os.getenv("TEE_PRIVATE_KEY", "")
EXPLORER_URL = "https://shadownet.explorer.etherlink.com/"

# ── ABI Loading ──────────────────────────────────────────────────────

def _load_abi() -> list:
    """Load the NDAIEscrow ABI from the Hardhat artifacts."""
    # Try Hardhat artifacts first
    artifact_path = Path(__file__).parent.parent / "contracts" / "artifacts" / "NDAIEscrow.sol" / "NDAIEscrow.json"
    if artifact_path.exists():
        with open(artifact_path) as f:
            data = json.load(f)
            return data.get("abi", [])
    
    # Fallback: embedded minimal ABI
    return _MINIMAL_ABI


# Minimal ABI for the functions we need (fallback if artifacts not built)
_MINIMAL_ABI = [
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}, {"name": "_seller", "type": "address"}, {"name": "_threshold", "type": "uint256"}],
        "name": "createDeal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}],
        "name": "depositFunds",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}, {"name": "_agreedPrice", "type": "uint256"}],
        "name": "acceptDeal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}],
        "name": "exitDeal",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}],
        "name": "getDeal",
        "outputs": [
            {"components": [
                {"name": "dealId", "type": "bytes32"},
                {"name": "seller", "type": "address"},
                {"name": "buyer", "type": "address"},
                {"name": "threshold", "type": "uint256"},
                {"name": "budgetCap", "type": "uint256"},
                {"name": "depositedAmount", "type": "uint256"},
                {"name": "agreedPrice", "type": "uint256"},
                {"name": "status", "type": "uint8"},
                {"name": "createdAt", "type": "uint256"},
                {"name": "settledAt", "type": "uint256"}
            ], "name": "", "type": "tuple"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "_dealId", "type": "bytes32"}],
        "name": "getDealStatus",
        "outputs": [{"name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
    },
]

DEAL_STATUS_MAP = {
    0: "Created",
    1: "Funded",
    2: "Accepted",
    3: "Exited",
    4: "Cancelled",
}


# ── Blockchain Client ────────────────────────────────────────────────

class BlockchainClient:
    """Wrapper for NDAIEscrow contract interactions."""

    def __init__(self):
        self._w3 = None
        self._contract = None
        self._account = None
        self._initialized = False

    def _ensure_init(self):
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
                logger.info(f"Blockchain client initialized. TEE wallet: {self._account.address}")
            else:
                logger.warning("TEE_PRIVATE_KEY not set — read-only mode")
            
            self._initialized = True
        except ImportError:
            logger.warning("web3 not installed — blockchain features disabled")
        except Exception as e:
            logger.error(f"Blockchain init failed: {e}")

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
        
        tx = tx_func.build_transaction({
            "from": self._account.address,
            "nonce": self._w3.eth.get_transaction_count(self._account.address),
            "gas": 300000,
            "gasPrice": self._w3.eth.gas_price,
            "chainId": ETHERLINK_CHAIN_ID,
            "value": value,
        })
        
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
        except Exception as e:
            logger.error(f"Failed to read deal from chain: {e}")
            return None


# Singleton instance
blockchain = BlockchainClient()
