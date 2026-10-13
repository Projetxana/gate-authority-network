(() => {
  const NETWORK =
    'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network';
  const BILLING =
    'https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-billing';

  const $ = id => document.getElementById(id);

  function state() {
    return typeof window.gateLiveState === 'function'
      ? window.gateLiveState()
      : { apiKey: null, project: null };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options
    });

    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('Invalid JSON response');
    }

    if (!response.ok) {
      const error = new Error(data.error || `HTTP ${response.status}`);
      error.details = data;
      error.status = response.status;
      throw error;
    }

    return data;
  }

  function auth(apiKey, extra = {}) {
    return {
      authorization: `Bearer ${apiKey}`,
      ...extra
    };
  }

  function setControls(enabled) {
    $('refreshBilling').disabled = !enabled;
    $('preparePro').disabled = !enabled;
    $('prepareScale').disabled = !enabled;
  }

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US') : '—';
  }

  async function loadBilling() {
    const { apiKey } = state();

    if (!apiKey) {
      $('billingStatus').textContent = 'Confirm a project first.';
      $('billingStatus').className = 'note';
      return;
    }

    $('billingStatus').textContent = 'Loading current plan…';
    $('billingStatus').className = 'note';
    $('checkoutReady').hidden = true;

    try {
      const [projectData, billingData] = await Promise.all([
        request(`${NETWORK}/v1/project`, {
          headers: auth(apiKey)
        }),
        request(`${BILLING}/status`, {
          headers: auth(apiKey)
        })
      ]);

      const entitlements = projectData.entitlements || {};
      const subscription = billingData.subscription || null;
      const plan = String(
        projectData.plan || billingData.projectPlan || 'unknown'
      ).toLowerCase();

      $('billingPlan').textContent = plan.toUpperCase();

      $('billingUsage').textContent =
        `${formatNumber(projectData.usage?.currentMonth)} / ` +
        `${formatNumber(projectData.usage?.included)}`;

      $('billingIssuers').textContent =
        formatNumber(entitlements.max_issuers);

      $('billingStrict').textContent =
        entitlements.allow_strict ? 'Available' : 'Not included';

      if ($('plan')) {
        $('plan').textContent = plan;
      }

      const hasManagedSubscription =
        subscription &&
        ['active', 'trialing', 'past_due'].includes(subscription.status);

      $('preparePro').disabled = hasManagedSubscription;
      $('prepareScale').disabled = hasManagedSubscription;

      $('openPortal').disabled =
        !subscription || !subscription.stripe_customer_id;

      if (subscription) {
        $('billingStatus').textContent =
          `Subscription: ${subscription.plan} · ${subscription.status}`;
      } else {
        $('billingStatus').textContent =
          'Free project · no paid subscription attached.';
      }

      $('billingStatus').className = 'ok';
    } catch (error) {
      $('billingStatus').textContent = error.message;
      $('billingStatus').className = 'error';
    }
  }

  async function prepareCheckout(plan) {
    const { apiKey } = state();

    if (!apiKey) return;

    $('checkoutReady').hidden = true;
    $('billingStatus').textContent =
      `Preparing ${plan.toUpperCase()} checkout…`;
    $('billingStatus').className = 'note';

    try {
      const data = await request(`${BILLING}/checkout`, {
        method: 'POST',
        headers: auth(apiKey, {
          'content-type': 'application/json'
        }),
        body: JSON.stringify({ plan })
      });

      $('checkoutPlan').textContent = data.plan.toUpperCase();
      $('checkoutLink').href = data.url;
      $('checkoutReady').hidden = false;

      $('billingStatus').textContent =
        'Checkout link ready. No payment has been made.';
      $('billingStatus').className = 'ok';
    } catch (error) {
      if (
        error.status === 409 &&
        error.details?.error === 'paid_subscription_already_exists'
      ) {
        $('billingStatus').textContent =
          `A paid subscription already exists (${error.details.currentPlan}). ` +
          'Use Manage billing.';
      } else {
        $('billingStatus').textContent = error.message;
      }

      $('billingStatus').className = 'error';
    }
  }

  async function openPortal() {
    const { apiKey } = state();

    if (!apiKey) return;

    try {
      const data = await request(`${BILLING}/portal`, {
        headers: auth(apiKey)
      });

      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      $('billingStatus').textContent = error.message;
      $('billingStatus').className = 'error';
    }
  }

  $('refreshBilling').onclick = loadBilling;
  $('preparePro').onclick = () => prepareCheckout('pro');
  $('prepareScale').onclick = () => prepareCheckout('scale');
  $('openPortal').onclick = openPortal;

  window.addEventListener('gate:project-confirmed', () => {
    setControls(true);
    loadBilling();
  });
})();
