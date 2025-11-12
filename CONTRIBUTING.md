# Contributing to Arc zkML + OOAK

Thank you for your interest in contributing to this project!

## Project Overview

This is a **research prototype** demonstrating zkML (zero-knowledge machine learning) proofs integrated with Circle's Object-Oriented Agent Kit (OOAK) on the Arc blockchain.

**Current Focus:**
- zkML proof generation using JOLT-Atlas
- ONNX model execution and verification
- EIP-712 commitment anchoring
- Attested proof verification

**Status**: Prototype/Research - Not Production Ready

## Getting Started

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18 or higher (for node-ui)
- **Git**: For version control
- **Rust**: (Optional) For building JOLT-Atlas from source

### Setup

```bash
# Clone repository
git clone https://github.com/hshadab/arc.git
cd arc

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies (for UI)
cd node-ui
npm install
cd ..
```

### Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit with your testnet credentials
# IMPORTANT: Use testnet keys only!
nano .env
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring

### 2. Make Changes

- Write clear, descriptive code
- Follow existing code style
- Test your changes locally
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run Python demo
python demo.py

# Run payment example
python example_payment_agent.py

# Test Node.js UI
cd node-ui
npm start
# Open http://localhost:8616
```

### 4. Commit Your Changes

Use clear, descriptive commit messages:

```bash
git commit -m "Add ONNX model caching for faster development"
git commit -m "Fix: Correct EIP-712 signature verification"
git commit -m "Docs: Update README with Arc testnet instructions"
```

**Good commit messages:**
- Start with a verb (Add, Fix, Update, Remove, Refactor)
- Be concise but descriptive
- Reference issues if applicable (#123)

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear title describing the change
- Description of what changed and why
- Test results or screenshots if applicable

## Code Style

### Python

- Follow **PEP 8** style guide
- Use type hints where appropriate
- Document functions with docstrings
- Use meaningful variable names

**Example:**
```python
def generate_zkml_proof(model_path: str, inputs: list[float]) -> dict:
    """
    Generate zkML proof for ONNX model execution.

    Args:
        model_path: Path to ONNX model file
        inputs: List of input values for the model

    Returns:
        Dictionary containing proof hash, decision, and confidence
    """
    # Implementation
    pass
```

### JavaScript/Node.js

- Use ES6+ syntax
- Async/await over callbacks
- Meaningful variable names
- Comment complex logic

**Example:**
```javascript
async function verifyAttestation(proofHash, signature) {
  try {
    const recovered = ethers.verifyMessage(proofHash, signature);
    return recovered.toLowerCase() === expectedAttestor.toLowerCase();
  } catch (error) {
    console.error('Attestation verification failed:', error);
    return false;
  }
}
```

## Project Structure

```
arc/
├── demo.py                    # Main demonstration
├── workflow.py                # ZK workflow manager
├── config.py                  # Configuration
├── ml/                        # ONNX inference
├── zk/                        # JOLT-Atlas integration
├── onchain/                   # Blockchain interaction
├── node-ui/                   # Web UI (Express/Node.js)
└── ooak/                      # OOAK-specific implementations
```

### Where to Put Your Code

- **ML/ONNX changes**: `/ml/`
- **zkML/JOLT changes**: `/zk/`
- **Blockchain/smart contracts**: `/onchain/`
- **Web UI**: `/node-ui/`
- **Documentation**: Root `.md` files or `/node-ui/` docs

## Security Guidelines

### Never Commit Secrets

❌ **DO NOT commit:**
- Private keys
- API keys
- Passwords or credentials
- Real wallet addresses with funds
- `.env` files with real values

✅ **DO commit:**
- `.env.example` with dummy values
- Documentation about configuration
- Public contract addresses (testnet)

### Test Security

When working on security-sensitive code:
- Test edge cases and error conditions
- Consider signature verification carefully
- Validate all inputs
- Handle errors gracefully

## Documentation

### When to Update Docs

Update documentation when you:
- Add new features
- Change existing behavior
- Add new configuration options
- Fix bugs that affect usage

### Documentation Files

- **README.md**: Project overview, quick start
- **node-ui/*.md**: Technical implementation docs
- **SECURITY.md**: Security guidelines (don't modify without reason)
- Code comments: Explain complex logic

## Testing

### Manual Testing Checklist

Before submitting PR:

- [ ] Python demo runs without errors
- [ ] Node UI loads and functions correctly
- [ ] zkML proof generation works
- [ ] Attestation verification passes
- [ ] No console errors or warnings
- [ ] Documentation updated if needed

### Test Examples

Test your changes with different scenarios:
- Valid inputs and edge cases
- Invalid inputs (error handling)
- Different model configurations
- Various network conditions

## Pull Request Checklist

Before submitting:

- [ ] Code follows style guidelines
- [ ] Changes tested locally
- [ ] Documentation updated
- [ ] No secrets committed
- [ ] Commit messages are clear
- [ ] PR description explains changes
- [ ] Branch is up to date with master

## Questions or Help?

- **Issues**: Open a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check existing `.md` files first

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers and help them learn
- Focus on the code, not the person
- Assume good intentions
- Keep discussions professional

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Arc zkML + OOAK!** 🚀

This project is for research and educational purposes. All contributions help advance the field of trustless autonomous agents with zero-knowledge proofs.
