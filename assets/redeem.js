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
  let code = (params.get('code') || '').trim().toUpperCase();

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
  function renderSignIn(message) {
    const email = el('input', { type: 'email', id: 'r-email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
    const password = el('input', { type: 'password', id: 'r-password', autocomplete: 'current-password', placeholder: 'Password', required: true, minlength: 8 });
    const err = errorLine();
    const done = el('div', { class: 'form-done', hidden: true });
    const signIn = el('button', { type: 'submit', class: 'btn-primary', text: 'Sign in' });
    const create = el('button', { type: 'button', class: 'btn-secondary', text: 'Create an account' });

    async function run(kind) {
      setError(err, '');
      if (!email.value.trim() || password.value.length < 8) return setError(err, 'Enter your email and a password of at least 8 characters.');
      signIn.disabled = create.disabled = true;
      try {
        if (kind === 'in') {
          const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
          if (error) throw error;
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: email.value.trim(), password: password.value,
            options: { emailRedirectTo: location.href },
          });
          if (error) throw error;
          if (!data.session) {
            form.hidden = true;
            done.textContent = `Check ${email.value.trim()} for a link to confirm your account. It brings you back here to redeem your voucher.`;
            done.hidden = false;
            return;
          }
        }
        render();
      } catch (ex) {
        setError(err, ex.message || 'Something went wrong. Please try again.');
      } finally {
        signIn.disabled = create.disabled = false;
      }
    }

    const form = el('form', { class: 'delete-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); run('in'); } },
      el('label', { for: 'r-email', class: 'r-label', text: 'Email' }), email,
      el('label', { for: 'r-password', class: 'r-label', text: 'Password' }), password,
      el('div', { class: 'r-row' }, signIn, create));
    create.addEventListener('click', () => run('up'));

    const google = el('button', {
      type: 'button', class: 'btn-secondary r-google', text: 'Continue with Google',
      onclick: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
        if (error) setError(err, error.message);
      },
    });

    show(
      el('p', { text: 'Sign in to the Duolign account you use (or will use) in the app, then redeem your voucher. Premium covers your whole household, so your partner gets it too.' }),
      codeNote(),
      message ? el('p', { class: 'form-error', text: message }) : null,
      el('p', { class: 'form-note', text: 'If your voucher was emailed to you, sign in with that same email address. The voucher only works for it.' }),
      form, google, err, done,
    );
  }

  // -- Signed in -------------------------------------------------------------
  function renderRedeem(session) {
    const input = el('input', { type: 'text', id: 'r-code', autocomplete: 'off', placeholder: 'DUOLIGN-XXXX-XXXX-XXXX', value: code, required: true });
    const err = errorLine();
    const button = el('button', { type: 'submit', class: 'btn-primary', text: 'Redeem voucher' });
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
            body: JSON.stringify({ code }),
          });
          const data = await resp.json().catch(() => null);
          if (resp.status === 401) return renderSignIn('Your session has ended. Please sign in again.');
          if (!resp.ok) throw new Error((data && data.detail) || 'Something went wrong. Please try again.');
          renderDone(data.status);
        } catch (ex) {
          setError(err, ex.message === 'Failed to fetch' ? "Can't reach Duolign right now. Please try again." : ex.message);
          button.disabled = false;
        }
      },
    }, el('label', { for: 'r-code', class: 'r-label', text: 'Voucher code' }), input, button);
    show(
      el('p', {}, 'Signed in as ', el('strong', { text: session.user.email || 'your account' }), '. ',
        el('button', { type: 'button', class: 'r-link', text: 'Not you?', onclick: signOut })),
      form, err,
    );
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
