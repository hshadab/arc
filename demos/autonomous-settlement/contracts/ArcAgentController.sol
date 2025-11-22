// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title ArcAgentController
 * @notice Trustless agent controller that enforces zkML proof verification before USDC transfers
 * @dev Holds USDC and only releases funds when valid proof signature is provided
 */
contract ArcAgentController is Ownable, EIP712 {
    using ECDSA for bytes32;

    IERC20 public immutable usdc;

    // Mapping to track used nonces (prevents replay attacks)
    mapping(uint256 => bool) public usedNonces;

    // Events for audit trail
    event TransferExecuted(
        address indexed to,
        uint256 amount,
        bytes32 proofHash,
        uint256 decision,
        uint256 nonce,
        uint256 timestamp
    );

    event FundsDeposited(address indexed from, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // EIP-712 type hash for the commitment struct
    bytes32 private constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(bytes32 proofHash,uint256 decision,uint256 timestamp,uint256 nonce)"
    );

    struct Commitment {
        bytes32 proofHash;
        uint256 decision;
        uint256 timestamp;
        uint256 nonce;
    }

    constructor(
        address _usdc,
        string memory name,
        string memory version
    ) EIP712(name, version) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Execute a USDC transfer with zkML proof verification
     * @param to Recipient address
     * @param amount Amount of USDC to transfer (in smallest units)
     * @param commitment The proof commitment data
     * @param signature EIP-712 signature from the agent
     */
    function executeTransfer(
        address to,
        uint256 amount,
        Commitment calldata commitment,
        bytes calldata signature
    ) external {
        // Verify nonce hasn't been used
        require(!usedNonces[commitment.nonce], "Nonce already used");

        // Verify decision is AUTHORIZED (1)
        require(commitment.decision == 1, "Transfer not authorized by zkML");

        // Verify timestamp is recent (within 1 hour)
        require(
            block.timestamp <= commitment.timestamp + 3600,
            "Commitment expired"
        );

        // Verify the signature
        bytes32 structHash = keccak256(abi.encode(
            COMMITMENT_TYPEHASH,
            commitment.proofHash,
            commitment.decision,
            commitment.timestamp,
            commitment.nonce
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        require(signer == owner(), "Invalid signature");

        // Mark nonce as used
        usedNonces[commitment.nonce] = true;

        // Execute the transfer
        require(usdc.transfer(to, amount), "USDC transfer failed");

        // Emit event for audit trail
        emit TransferExecuted(
            to,
            amount,
            commitment.proofHash,
            commitment.decision,
            commitment.nonce,
            commitment.timestamp
        );
    }

    /**
     * @notice Deposit USDC into the controller
     * @param amount Amount to deposit
     */
    function deposit(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "Deposit failed");
        emit FundsDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the controller (owner only)
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(usdc.transfer(msg.sender, amount), "Withdrawal failed");
        emit FundsWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Get the USDC balance of the controller
     */
    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /**
     * @notice Get the domain separator for EIP-712
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
