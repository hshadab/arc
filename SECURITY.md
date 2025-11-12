# Security Guidelines

## ⚠️ CRITICAL: Private Keys in Repository

**IMMEDIATE ACTION REQUIRED:**

The `.env` file in this repository contains actual private keys and should be rotated immediately if this is a public repository or has been shared.

### Current Exposed Credentials

If you have cloned this repository, be aware that it may contain:
- Private keys for testnet wallets
- API keys for Circle Gateway
- RPC endpoints and addresses

**Action Items:**
1. ✅ **Rotate all private keys immediately** if using real funds
2. ✅ **Use .env.example templates** with dummy values for commits
3. ✅ **Never commit .env files** with real credentials
4. ✅ **Use testnet-only keys** for development

## Best Practices

### For Development

```bash
# Copy template
cp .env.example .env

# Edit with your testnet credentials only
nano .env

# Verify .env is gitignored
git check-ignore .env  # Should show: .env
```

### Environment Variables

Required environment variables:
```env
# Arc Blockchain (Testnet)
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002

# NEVER commit real private keys
PRIVATE_KEY=0x...  # Testnet key only

# OOAK Configuration
OOAK_ONNX_MODEL=./models/spending_model.onnx
JOLT_ENABLED=true
```

### For Production (Future)

- ❌ Never use .env files in production
- ✅ Use secure secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
- ✅ Rotate keys regularly
- ✅ Use separate wallets for each environment
- ✅ Audit smart contracts before mainnet deployment

## Smart Contract Security

### Current Status: ⚠️ PROTOTYPE - NOT AUDITED

The smart contracts in this repository are:
- **NOT audited** by professional security firms
- **NOT recommended** for production use
- **Designed for testnet/prototype** purposes only

### Before Production:

1. **Professional Security Audit** - Engage Trail of Bits, OpenZeppelin, or ConsenSys Diligence
2. **Comprehensive Testing** - Achieve >95% test coverage with edge cases
3. **Formal Verification** - Consider for critical functions
4. **Bug Bounty Program** - Run before mainnet launch

## zkML Security Considerations

### JOLT-Atlas Proofs

- ⚠️ This implementation uses **attested** proofs (ECDSA signatures), not full ZK verification
- The attestor's private key must be secured
- Proof generation happens server-side - secure the server environment
- Consider full ZK verification for production use cases

### ONNX Model Integrity

- Models should be pinned and verified (hash checks)
- Model updates should go through review process
- Be aware of adversarial ML attacks
- Document model training and validation process

## Responsible Disclosure

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. **DO NOT** disclose publicly before fix
3. Email security concerns to: [Add your security email]
4. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and coordinate disclosure timeline.

## Dependencies

### Regular Updates

```bash
# Python dependencies
pip list --outdated
pip install --upgrade -r requirements.txt

# Node.js dependencies
cd node-ui
npm audit
npm update
```

### Known Considerations

- `onnxruntime` - Keep updated for security patches
- `web3.py` / `ethers` - Critical for transaction signing
- Review dependencies before adding new ones

## Checklist Before Going Live

- [ ] All private keys rotated from development versions
- [ ] .env file removed from repository
- [ ] Smart contracts professionally audited
- [ ] Comprehensive test coverage
- [ ] Security documentation complete
- [ ] Incident response plan in place
- [ ] Monitoring and alerting setup
- [ ] Access controls reviewed
- [ ] Secrets moved to secure vault
- [ ] Bug bounty program launched

---

**Project Status**: 🚧 Prototype/Research - Not Production Ready

**Last Updated**: 2025-11-12

**Remember**: This is a demonstration project. Never use it with real funds without proper security audits.
