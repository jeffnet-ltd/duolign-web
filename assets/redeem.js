// Voucher redemption (B2B voucher programme, stage 4). Vouchers are
// redeemed here on the website, never in the app (Apple 3.1.1 / 3.1.3(b)).
// Signs in with the same Supabase account the app uses, then calls the
// Duolign API with that session. Server text is rendered with textContent.
(function () {
  const SUPABASE_URL = 'https://jqvknxxpeqlcmehheaaq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmtueHhwZXFsY21laGhlYWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTE3NTksImV4cCI6MjEwMzQ2Nzc1OX0.hUJ4_D16845wdMwJFpEx-ue0EXkseQ1TNjfat7QY6w4';
  const API = 'https://couplefinanceapp-production.up.railway.app/api';
  const root = document.getElementById('redeem-app');
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const params = new URLSearchParams(location.search);
  // Sign-up confirmation emails and Google sign-in come back to this page.
  // Supabase only honours a return address that's on its allow-list, and
  // the voucher code in the query string stopped it matching -- it fell
  // back to the app instead. So: return to the bare page, and remember the
  // code in the browser to fill it back in.
  const RETURN_URL = location.origin + location.pathname;
  const CODE_KEY = 'duolign_redeem_code';
  const remember = (c) => { try { if (c) localStorage.setItem(CODE_KEY, c); } catch { /* private mode */ } };
  const recall = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; } };
  const forget = () => { try { localStorage.removeItem(CODE_KEY); } catch { /* ignore */ } };
  let code = (params.get('code') || recall()).trim().toUpperCase();
  remember(code);

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }
  const show = (...nodes) => root.replaceChildren(...nodes.filter((n) => n != null));
  const errorLine = () => el('p', { class: 'form-error', hidden: true });
  function setError(node, message) { node.textContent = message || ''; node.hidden = !message; }

  function codeNote() {
    return code ? el('p', { class: 'r-code' }, 'Your voucher: ', el('strong', { text: code })) : null;
  }

  // -- Signed out ------------------------------------------------------------
  // Opens in "create an account" mode: a client redeeming a voucher most
  // likely doesn't have a Duolign account yet. The password they choose
  // here is the one they'll use in the app, so it's entered twice.
  function renderSignIn(message, mode = 'create') {
    const creating = mode === 'create';
    const email = el('input', { type: 'email', id: 'r-email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
    const password = el('input', {
      type: 'password', id: 'r-password', required: true, minlength: 8,
      autocomplete: creating ? 'new-password' : 'current-password',
      placeholder: creating ? 'At least 8 characters' : 'Password',
    });
    const confirm = creating
      ? el('input', { type: 'password', id: 'r-password2', autocomplete: 'new-password', placeholder: 'Type it again', required: true })
      : null;
    const err = errorLine();
    const done = el('div', { class: 'form-done', hidden: true });
    const submit = el('button', { type: 'submit', class: 'btn-primary', text: creating ? 'Create account' : 'Sign in' });

    async function run() {
      setError(err, '');
      const address = email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setError(err, 'Enter your email address.');
      if (password.value.length < 8) return setError(err, 'Your password needs at least 8 characters.');
      if (creating && password.value !== confirm.value) return setError(err, "The two passwords don't match. Please type them again.");
      submit.disabled = true;
      try {
        if (creating) {
          const { data, error } = await supabase.auth.signUp({
            email: address, password: password.value,
            options: { emailRedirectTo: RETURN_URL },
          });
          if (error) throw error;
          if (!data.session) {
            form.hidden = true;
            switcher.hidden = true;
            google.hidden = true;
            done.textContent = `Check ${address} for a link to confirm your account. Open it on this device and it brings you back here to redeem your voucher.`;
            done.hidden = false;
            return;
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: address, password: password.value });
          if (error) throw error;
        }
        render();
      } catch (ex) {
        setError(err, ex.message || 'Something went wrong. Please try again.');
      } finally {
        submit.disabled = false;
      }
    }

    const form = el('form', { class: 'delete-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); run(); } },
      el('label', { for: 'r-email', class: 'r-label', text: 'Email' }), email,
      el('label', { for: 'r-password', class: 'r-label', text: creating ? 'Choose a password' : 'Password' }), password,
      creating ? el('label', { for: 'r-password2', class: 'r-label', text: 'Confirm your password' }) : null, confirm,
      submit);

    const switcher = el('p', { class: 'form-note' },
      creating ? 'Already have a Duolign account? ' : 'New to Duolign? ',
      el('button', {
        type: 'button', class: 'r-link', text: creating ? 'Sign in instead' : 'Create an account',
        onclick: () => renderSignIn(null, creating ? 'signin' : 'create'),
      }));

    const google = el('button', {
      type: 'button', class: 'btn-secondary r-google', text: 'Continue with Google',
      onclick: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: RETURN_URL } });
        if (error) setError(err, error.message);
      },
    });

    show(
      el('p', { text: creating
        ? "Create your Duolign account to redeem your voucher. You'll use this email and password to sign in to the Duolign app. Premium covers your whole household, so your partner gets it too."
        : 'Sign in with your Duolign account to redeem your voucher. Premium covers your whole household, so your partner gets it too.' }),
      codeNote(),
      el('p', { class: 'form-note', text: 'If your voucher was emailed to you, use that same email address. The voucher only works for it.' }),
      message ? el('p', { class: 'form-error', text: message }) : null,
      err,
      form, switcher, google, done,
    );
    email.focus();
  }

  // -- Signed in -------------------------------------------------------------
  function renderRedeem(session) {
    const input = el('input', { type: 'text', id: 'r-code', autocomplete: 'off', placeholder: 'DUOLIGN-XXXX-XXXX-XXXX', value: code, required: true });
    const err = errorLine();
    const button = el('button', { type: 'submit', class: 'btn-primary', text: 'Redeem voucher' });
    // Marketing opt-in (stage 8): unticked unless they tick it; sent only
    // once the voucher has gone through.
    const optIn = el('input', { type: 'checkbox', id: 'r-optin' });
    // "Let <business> know it was me" (2026-10-30): only for a voucher from a
    // partner business, unticked unless the client ticks it. Only then does
    // the business see their email against the voucher it gave them.
    const share = el('input', { type: 'checkbox', id: 'r-share' });
    const shareText = el('span');
    const shareRow = el('label', { class: 'r-check', for: 'r-share', hidden: true }, share, shareText);
    let lookedUp = '';
    async function lookUpBusiness() {
      const c = input.value.trim().toUpperCase();
      if (!c || c === lookedUp) return;
      lookedUp = c;
      try {
        const r = await fetch(`${API}/vouchers/${encodeURIComponent(c)}/from`);
        const d = r.ok ? await r.json() : null;
        if (d && d.business_name && input.value.trim().toUpperCase() === c) {
          shareText.textContent = `Let ${d.business_name} know it was me. Optional: they'll see your email address next to the voucher they gave you.`;
          shareRow.hidden = false;
        } else {
          shareRow.hidden = true;
          share.checked = false;
        }
      } catch { /* the box just stays hidden */ }
    }
    input.addEventListener('change', lookUpBusiness);
    input.addEventListener('blur', lookUpBusiness);
    const form = el('form', {
      class: 'delete-form', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        setError(err, '');
        code = input.value.trim().toUpperCase();
        if (!code) return setError(err, 'Enter your voucher code.');
        button.disabled = true;
        try {
          const resp = await fetch(`${API}/vouchers/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ code, share_with_partner: !shareRow.hidden && share.checked }),
          });
          const data = await resp.json().catch(() => null);
          if (resp.status === 401) return renderSignIn('Your session has ended. Please sign in again.', 'signin');
          if (!resp.ok) throw new Error((data && data.detail) || 'Something went wrong. Please try again.');
          forget();
          if (optIn.checked) {
            fetch(`${API}/marketing-consent`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ opt_in: true, source: 'redeem_page' }),
            }).catch(() => {});
          }
          renderDone(data.status);
        } catch (ex) {
          setError(err, ex.message === 'Failed to fetch' ? "Can't reach Duolign right now. Please try again." : ex.message);
          button.disabled = false;
        }
      },
    }, el('label', { for: 'r-code', class: 'r-label', text: 'Voucher code' }), input,
      code ? null : el('p', { class: 'form-note', text: "It's on your voucher or in the email it came in, starting DUOLIGN-." }),
      shareRow,
      el('label', { class: 'r-check', for: 'r-optin' }, optIn,
        el('span', { text: 'Email me news and offers from Duolign. Optional; turn it off any time in the app’s Settings.' })),
      button);
    show(
      el('p', {}, 'Signed in as ', el('strong', { text: session.user.email || 'your account' }), '. ',
        el('button', { type: 'button', class: 'r-link', text: 'Not you?', onclick: signOut })),
      form, err,
    );
    lookUpBusiness();
  }

  function renderDone(status) {
    show(
      el('div', { class: 'form-done' }, status === 'redeemed'
        ? 'Done! Premium is now active for your household. Open the Duolign app to start using it.'
        : "Your voucher is saved to your account. Set up your household in the Duolign app, signing in with this same account, and Premium switches on automatically. Your partner gets it too when they join."),
      el('button', { type: 'button', class: 'r-link', text: 'Sign out', onclick: signOut }),
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    renderSignIn();
  }

  async function render() {
    const { data } = await supabase.auth.getSession();
    if (data.session) renderRedeem(data.session);
    else renderSignIn();
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') render();
  });
  render();
})();
