// x402 UI Integration Patch
// Add this script to index.html to display payment information

(function() {
  console.log('[x402-ui] Initializing payment tracking');

  let totalCost = 0;

  // Add cost tracker to page
  function initCostTracker() {
    const hero = document.querySelector('.hero');
    if (!hero || document.getElementById('cost-tracker')) return;

    const tracker = document.createElement('div');
    tracker.id = 'cost-tracker';
    tracker.className = 'cost-tracker';
    tracker.innerHTML = '💰 Total Cost: <span class="cost-amount">$0.000</span>';
    tracker.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(77, 226, 207, 0.1);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--accent);
      display: none;
    `;
    hero.appendChild(tracker);
  }

  // Update cost tracker
  function updateCost(amount) {
    totalCost += parseFloat(amount);
    const tracker = document.getElementById('cost-tracker');
    if (tracker) {
      tracker.style.display = 'block';
      tracker.querySelector('.cost-amount').textContent = `$${totalCost.toFixed(3)}`;
    }
  }

  // Show payment status in x402 Agent box
  function showPaymentStatus(status, details) {
    const agentPaymentLink = document.getElementById('agent-payment-link');
    if (!agentPaymentLink) return;

    if (status === 'paying') {
      agentPaymentLink.innerHTML = `
        <span class="payment-badge paying">💳 Paying ${details.cost} on Arc...</span>
      `;
      agentPaymentLink.style.display = 'block';
    } else if (status === 'paid') {
      agentPaymentLink.innerHTML = `
        <a href="${details.explorer}" target="_blank" style="text-decoration: none;">
          <span class="payment-badge paid">✓ Paid ${details.cost} on Arc</span>
        </a>
      `;
      agentPaymentLink.style.display = 'block';
    }
  }

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .payment-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 8px;
      text-transform: uppercase;
    }
    .payment-badge.paying {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
      animation: x402-pulse 1.5s infinite;
    }
    .payment-badge.paid {
      background: rgba(16, 185, 129, 0.2);
      color: var(--success);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .payment-badge.paid:hover {
      background: rgba(16, 185, 129, 0.3);
      transform: translateY(-1px);
    }
    @keyframes x402-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .tx-link {
      font-size: 11px;
      color: var(--accent);
      text-decoration: none;
      margin-left: 6px;
    }
    .tx-link:hover {
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCostTracker);
  } else {
    initCostTracker();
  }

  // Expose functions globally
  window.x402UI = {
    updateCost,
    showPaymentStatus,
    resetCost: () => {
      totalCost = 0;
      const tracker = document.getElementById('cost-tracker');
      if (tracker) {
        tracker.style.display = 'none';
        tracker.querySelector('.cost-amount').textContent = '$0.000';
      }
    }
  };

  console.log('[x402-ui] Ready. Use window.x402UI to control payment display');
})();
