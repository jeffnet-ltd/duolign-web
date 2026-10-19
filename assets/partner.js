// Partner page (B2B voucher partnership programme, stage 3). Talks to the
// Duolign API's /api/partner/* routes. Everything from the server is
// rendered with textContent -- never innerHTML -- so a business name or
// client email can never inject markup.
(function () {
  const API = 'https://couplefinanceapp-production.up.railway.app/api/partner';
  const SESSION_KEY = 'duolign_partner_session';
  const root = document.getElementById('partner-app');

  const store = {
    get() { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(SESSION_KEY, v); } catch { /* private mode: session lasts this tab only */ } },
    clear() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
  };
  let memorySession = null;
  const session = () => memorySession || store.get();

  async function call(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const s = session();
    if (s) headers.Authorization = `Bearer ${s}`;
    let resp;
    try {
      resp = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw Object.assign(new Error("Can't reach Duolign right now. Check your connection and try again."), { status: 0 });
    }
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw Object.assign(new Error((data && data.detail) || 'Something went wrong. Please try again.'), { status: resp.status });
    }
    return data;
  }

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

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  function show(...nodes) {
    root.replaceChildren(...nodes.filter((n) => n != null)); // replaceChildren would print null as text
  }

  function errorLine() {
    return el('p', { class: 'form-error', hidden: true });
  }
  function setError(node, message) {
    node.textContent = message || '';
    node.hidden = !message;
  }

  // -- Sign in ---------------------------------------------------------------
  function renderSignIn(message) {
    const input = el('input', { type: 'email', id: 'partner-email', placeholder: 'you@yourbusiness.co.uk', required: true, autocomplete: 'email' });
    const err = errorLine();
    const done = el('div', { class: 'form-done', hidden: true });
    const button = el('button', { type: 'submit', class: 'btn-primary', text: 'Email me a sign-in link' });
    const form = el('form', {
      class: 'delete-form', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        setError(err, '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value.trim())) return setError(err, 'Enter the email address your business was enrolled with.');
        button.disabled = true;
        try {
          const r = await call('/sign-in-link', { method: 'POST', body: { email: input.value.trim() } });
          form.hidden = true;
          done.textContent = `${r.message} It works once and expires in 15 minutes.`;
          done.hidden = false;
        } catch (ex) {
          setError(err, ex.message);
        } finally {
          button.disabled = false;
        }
      },
    },
    el('label', { for: 'partner-email', class: 'p-label', text: 'Your business email' }), input, button);
    show(
      el('p', { text: 'Sign in to send your complimentary Duolign Premium vouchers to clients. Use the email address your business was enrolled with, and we\'ll email you a one-time link. No password needed.' }),
      message ? el('p', { class: 'form-error', text: message }) : null,
      form, err, done,
    );
  }

  // -- Terms -----------------------------------------------------------------
  function renderTerms(me) {
    const box = el('input', { type: 'checkbox', id: 'terms-agree' });
    const err = errorLine();
    const button = el('button', {
      type: 'button', class: 'btn-primary',
      onclick: async () => {
        if (!box.checked) return setError(err, 'Please tick the box to confirm you agree.');
        button.disabled = true;
        try {
          await call('/accept-terms', { method: 'POST', body: { version: me.terms_version } });
          load();
        } catch (ex) {
          setError(err, ex.message);
          button.disabled = false;
        }
      },
    }, 'Agree and continue');
    show(
      el('h3', { text: `Welcome, ${me.business_name}` }),
      el('p', { text: 'Before you send any vouchers, please read and agree to the partner programme terms. The most important points:' }),
      el('ul', {},
        el('li', { text: 'Only send a voucher to a client who has agreed to receive it. You must have their permission to give us their email address.' }),
        el('li', { text: "Don't send vouchers to yourself, your staff, or your own business email addresses, and send each client only one." }),
        el('li', { text: 'Vouchers have no cash value and can\'t be sold.' }),
      ),
      el('p', {}, 'Read the full ', el('a', { class: 'inline', href: 'partner-terms.html', target: '_blank', rel: 'noopener', text: 'Partner Business Programme Terms' }), '.'),
      el('label', { class: 'p-check', for: 'terms-agree' }, box, el('span', { text: 'I have read and agree to the Partner Business Programme Terms on behalf of my business.' })),
      button, err,
    );
  }

  // -- Vouchers --------------------------------------------------------------
  function voucherCard(v) {
    const status = el('p', { class: 'p-status' });
    const card = el('div', { class: `p-card p-${v.state}` }, el('p', { class: 'p-code', text: v.code }), status);
    if (v.state === 'redeemed') {
      status.textContent = `Redeemed on ${fmtDate(v.redeemed_at)}${v.sent_to ? ` by ${v.sent_to}` : ''}`;
      return card;
    }
    if (v.state !== 'unused') {
      status.textContent = v.state === 'expired' ? 'Expired' : 'Cancelled by Duolign';
      return card;
    }
    status.textContent = v.sent_to
      ? `Sent to ${v.sent_to} on ${fmtDate(v.sent_at)}. Not redeemed yet.`
      : `Not sent yet${v.valid_until ? ` · send and redeem by ${fmtDate(v.valid_until)}` : ''}`;

    const input = el('input', { type: 'email', placeholder: "Client's email address", 'aria-label': `Client's email for ${v.code}` });
    const err = errorLine();
    const send = el('button', { type: 'submit', class: 'btn-primary', text: v.sent_to ? 'Resend to this address' : 'Send voucher' });
    const form = el('form', {
      class: 'p-send', novalidate: true, hidden: Boolean(v.sent_to),
      onsubmit: async (e) => {
        e.preventDefault();
        setError(err, '');
        const email = input.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError(err, "Enter your client's email address.");
        if (!window.confirm(`Send this voucher to ${email}? Only send it if they've agreed to receive it. It will only work for that address.`)) return;
        send.disabled = true;
        try {
          await call(`/vouchers/${encodeURIComponent(v.code)}/send`, { method: 'POST', body: { email } });
          load();
        } catch (ex) {
          if (ex.status === 401) return signOut(ex.message);
          setError(err, ex.message);
          send.disabled = false;
        }
      },
    }, input, send);
    card.append(form, err);
    if (v.sent_to) {
      card.append(el('button', {
        type: 'button', class: 'p-link', text: 'Change email or resend',
        onclick: (e) => { form.hidden = false; input.value = v.sent_to; e.target.remove(); input.focus(); },
      }));
    }
    return card;
  }

  function renderDashboard(me) {
    const comp = me.vouchers.filter((v) => v.kind === 'complimentary');
    const packs = me.vouchers.filter((v) => v.kind !== 'complimentary');
    const discount = me.discount_unlocked
      ? el('div', { class: 'form-done' }, `You've sent all ${me.complimentary_total} complimentary vouchers, so you've unlocked 20% off your first voucher pack. We'll email you your code, and it will appear here too. Use it by ${fmtDate(me.discount_deadline)}.`)
      : el('div', { class: 'p-note' },
        `Send all ${me.complimentary_total} by ${fmtDate(me.distribution_deadline)} to unlock 20% off your first voucher pack (${me.complimentary_sent} of ${me.complimentary_total} sent). Your clients don't need to have redeemed them.`);
    show(
      el('div', { class: 'p-head' },
        el('h3', { text: me.business_name }),
        el('button', { type: 'button', class: 'p-link', text: 'Sign out', onclick: () => signOut() }),
      ),
      el('p', { text: "Enter a client's email address and we'll email them their voucher on your behalf, with a link to redeem it. Each voucher gives the couple 3 months of Duolign Premium, starting when they redeem it, and only works for the email address you send it to." }),
      discount,
      el('h4', { text: 'Complimentary vouchers' }),
      ...comp.map(voucherCard),
      packs.length ? el('h4', { text: 'Vouchers from your packs' }) : null,
      ...packs.map(voucherCard),
      el('p', { class: 'form-note' }, 'Need more vouchers? ', el('a', { class: 'inline', href: 'pricing.html', text: 'Buy a voucher pack' }), '. Questions: ', el('a', { class: 'inline', href: 'mailto:support@duolign.co.uk', text: 'support@duolign.co.uk' })),
    );
  }

  function signOut(message) {
    memorySession = null;
    store.clear();
    renderSignIn(message);
  }

  async function load() {
    if (!session()) return renderSignIn();
    try {
      const me = await call('/me');
      return me.terms_accepted ? renderDashboard(me) : renderTerms(me);
    } catch (ex) {
      if (ex.status === 401) return signOut(ex.message);
      show(el('p', { class: 'form-error', text: ex.message }), el('button', { type: 'button', class: 'btn-primary', text: 'Try again', onclick: load }));
    }
  }

  async function start() {
    const link = new URLSearchParams(location.hash.slice(1)).get('link');
    if (link) {
      history.replaceState(null, '', location.pathname); // the token never lingers in history
      show(el('p', { text: 'Signing you in…' }));
      try {
        const { session: s } = await call('/session', { method: 'POST', body: { token: link } });
        memorySession = s;
        store.set(s);
      } catch (ex) {
        return renderSignIn(ex.message);
      }
    }
    load();
  }

  start();
  // Opening a sign-in link in a tab that already shows this page only
  // changes the #fragment, which doesn't reload -- handle it here too.
  window.addEventListener('hashchange', () => { if (location.hash.includes('link=')) start(); });
})();
