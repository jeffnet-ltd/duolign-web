// Partner dashboard (B2B voucher partnership programme; dashboard 2026-10-30).
// Talks to the Duolign API's /api/partner/* routes. Everything from the server
// is rendered with textContent -- never innerHTML -- so a business name, a note
// or a client email can never inject markup. The one exception is the QR code
// SVG, which qrcode-generator builds locally from a redeem link we made.
(function () {
  const API = 'https://couplefinanceapp-production.up.railway.app/api/partner';
  const SESSION_KEY = 'duolign_partner_session';
  const root = document.getElementById('partner-app');
  const printSheet = document.getElementById('print-sheet');

  // The published packs (pricing.html). A purchase from here carries the
  // business's id (client_reference_id), so it's theirs whoever pays.
  const PACKS = [
    { size: 10, price: 300, each: 30, url: 'https://buy.stripe.com/00w14mfwj6Dv02cfAk53O03' },
    { size: 25, price: 675, each: 27, url: 'https://buy.stripe.com/dRm4gy1Ftd1T8yI87S53O04' },
    { size: 50, price: 1200, each: 24, url: 'https://buy.stripe.com/bJe28q5VJd1T9CM4VG53O05' },
  ];
  const NOTE_LIMIT = 120;
  const PAGE = 20;

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
    for (const c of children) if (c != null && c !== false) node.append(c);
    return node;
  }

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const fmtShort = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  const money = (n) => `£${Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const HANDED = { link: 'Link shared', qr: 'QR code shown', email: 'Emailed', print: 'Printed' };

  function show(...nodes) {
    root.replaceChildren(...nodes.filter((n) => n != null && n !== false));
  }
  function errorLine() {
    return el('p', { class: 'form-error', hidden: true, role: 'alert' });
  }
  function setError(node, message) {
    node.textContent = message || '';
    node.hidden = !message;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function qrSvg(text, cell) {
    if (typeof window.qrcode !== 'function') return null;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const wrap = el('div', { class: 'p-qr' });
    wrap.innerHTML = qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
    const svg = wrap.querySelector('svg');
    if (svg) svg.setAttribute('aria-hidden', 'true');
    return wrap;
  }

  // -- Sign in ---------------------------------------------------------------
  function renderSignIn(message) {
    const input = el('input', { type: 'email', id: 'partner-email', placeholder: 'you@yourbusiness.co.uk', required: true, autocomplete: 'email' });
    const err = errorLine();
    const done = el('div', { class: 'form-done', hidden: true });
    const button = el('button', { type: 'submit', class: 'btn-primary', text: 'Email me a sign-in link' });
    const form = el('form', {
      class: 'p-form', novalidate: true,
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
    show(el('div', { class: 'p-narrow' },
      el('p', { text: "Sign in to hand out your Duolign Premium vouchers and see how they're doing. Use the email address your business was enrolled with, and we'll email you a one-time link. No password needed." }),
      message ? el('p', { class: 'form-error', text: message }) : null,
      form, err, done,
    ));
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
    show(el('div', { class: 'p-narrow' },
      el('h3', { text: `Welcome, ${me.business_name}` }),
      el('p', { text: 'Before you hand out any vouchers, please read and agree to the partner programme terms. The most important points:' }),
      el('ul', {},
        el('li', { text: 'Only give a voucher to a client who wants it. If you email it, you must have their permission to give us their email address.' }),
        el('li', { text: "One voucher covers a couple. Give it to just one of them: their partner gets Premium too when they join the household in the app." }),
        el('li', { text: "Your notes on who you gave each voucher to are yours to keep. We can't tell you who redeemed a voucher unless your client chooses to let you know." }),
        el('li', { text: "Don't give vouchers to yourself or your staff." }),
        el('li', { text: "Vouchers have no cash value and can't be sold." }),
      ),
      el('p', {}, 'Read the full ', el('a', { class: 'inline', href: 'partner-terms.html', target: '_blank', rel: 'noopener', text: 'Partner Business Programme Terms' }), '.'),
      el('label', { class: 'p-check', for: 'terms-agree' }, box, el('span', { text: 'I have read and agree to the Partner Business Programme Terms on behalf of my business.' })),
      button, err,
    ));
  }

  // -- Dashboard -------------------------------------------------------------
  let me = null;
  const view = { filter: 'all', search: '', shown: {} };

  function nextAvailable() {
    return me.vouchers.find((v) => v.state === 'available') || null;
  }

  function statTiles() {
    const t = me.totals;
    const used = t.redeemed + t.held;
    const o = me.outcomes;
    const tile = (label, value, detail) => el('div', { class: 'p-tile' },
      el('span', { class: 'p-tile__label', text: label }),
      el('span', { class: 'p-tile__value', text: String(value) }),
      detail ? el('span', { class: 'p-tile__detail', text: detail }) : null);
    return el('section', { class: 'p-stats', 'aria-label': 'Your vouchers at a glance' },
      tile('Ready to hand out', t.available, `of ${t.total} vouchers`),
      tile('Handed out', t.handed_out + used, t.handed_out ? `${t.handed_out} waiting to be redeemed` : 'every one redeemed'),
      tile('Redeemed', used, t.held ? `${t.held} not started in the app yet` : 'couples using Premium'),
      o.shown
        ? tile(`Still using it after ${o.retention_days} days`, o.retention_eligible ? `${o.active_after_30_days} of ${o.retention_eligible}` : '–', `${plural(o.subscribed, 'couple')} went on to subscribe`)
        : tile('How they’re getting on', '–', `Shown once ${o.min_redeemed} couples have redeemed, so no figure points to one couple`),
    );
  }

  // The hand-out panel: who it's for, then a link, a QR code or an email.
  function handOutPanel(preset) {
    const v = preset || nextAvailable();
    const card = el('section', { class: 'p-panel', 'aria-labelledby': 'handout-title' });
    if (!v) {
      card.append(
        el('h4', { id: 'handout-title', text: 'Hand out a voucher' }),
        el('p', { class: 'p-muted', text: "You've handed out every voucher. Buy a pack below to keep going." }),
      );
      return card;
    }
    const noteId = 'handout-note';
    const note = el('input', { type: 'text', id: noteId, maxlength: String(NOTE_LIMIT), placeholder: 'e.g. Sarah & Tom Patel', autocomplete: 'off' });
    const err = errorLine();
    const result = el('div', { class: 'p-result', hidden: true, 'aria-live': 'polite' });
    const emailRow = el('form', { class: 'p-inline', hidden: true, novalidate: true });
    const emailInput = el('input', { type: 'email', placeholder: "One partner's email", 'aria-label': "Your client's email (one partner of the couple)" });
    const emailSend = el('button', { type: 'submit', class: 'btn-primary', text: 'Send voucher' });
    emailRow.append(emailInput, emailSend);

    const needNote = () => {
      if (note.value.trim()) return true;
      setError(err, "Add who it's for first, so you'll know who redeemed it.");
      note.focus();
      return false;
    };
    const finish = (...nodes) => {
      for (const b of buttons) b.disabled = true;
      note.disabled = true;
      result.replaceChildren(...nodes, el('button', { type: 'button', class: 'btn-primary', text: 'Done', onclick: () => load() }));
      result.hidden = false;
    };

    const linkBtn = el('button', {
      type: 'button', class: 'p-btn', text: 'Copy link',
      onclick: async () => {
        setError(err, '');
        if (!needNote()) return;
        try {
          const r = await call(`/vouchers/${encodeURIComponent(v.code)}/hand-out`, { method: 'POST', body: { via: 'link', note: note.value } });
          const copied = await copyText(r.redeem_link);
          const linkField = el('input', { type: 'text', readonly: true, value: r.redeem_link, class: 'p-linkfield', 'aria-label': 'Redeem link' });
          finish(
            el('p', { class: 'p-ok', text: copied ? `Link copied for ${r.note}. Paste it into a message, WhatsApp or an email.` : `Here's the link for ${r.note}. Select it and copy it.` }),
            linkField,
          );
          if (!copied) { linkField.focus(); linkField.select(); }
        } catch (ex) { handleError(ex, err); }
      },
    });
    const qrBtn = el('button', {
      type: 'button', class: 'p-btn', text: 'Show QR code',
      onclick: async () => {
        setError(err, '');
        if (!needNote()) return;
        try {
          const r = await call(`/vouchers/${encodeURIComponent(v.code)}/hand-out`, { method: 'POST', body: { via: 'qr', note: note.value } });
          finish(
            el('p', { class: 'p-ok', text: `Ask ${r.note} to scan this with their phone's camera.` }),
            qrSvg(r.redeem_link, 8) || el('p', { class: 'p-code', text: r.redeem_link }),
            el('p', { class: 'p-code p-center', text: r.code }),
          );
        } catch (ex) { handleError(ex, err); }
      },
    });
    const emailBtn = el('button', {
      type: 'button', class: 'p-btn', text: 'Email it',
      onclick: () => { setError(err, ''); emailRow.hidden = false; emailInput.focus(); },
    });
    emailRow.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(err, '');
      const email = emailInput.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError(err, "Enter your client's email address.");
      if (!window.confirm(`Email this voucher to ${email}?\n\nOnly send it if they've agreed to receive it. It will only work for that address.`)) return;
      emailSend.disabled = true;
      try {
        await call(`/vouchers/${encodeURIComponent(v.code)}/send`, { method: 'POST', body: { email, note: note.value || email } });
        finish(el('p', { class: 'p-ok', text: `Sent to ${email}. We've emailed them the voucher with a link to redeem it.` }));
      } catch (ex) { emailSend.disabled = false; handleError(ex, err); }
    });
    const buttons = [linkBtn, qrBtn, emailBtn];

    card.append(
      el('div', { class: 'p-panel__head' },
        el('h4', { id: 'handout-title', text: 'Hand out a voucher' }),
        el('span', { class: 'p-muted p-small', text: `${v.duration_months} months of Premium · ${v.code}` })),
      el('label', { for: noteId, class: 'p-label', text: "Who's it for?" }),
      note,
      el('div', { class: 'p-actions' }, ...buttons),
      emailRow, err, result,
    );
    return card;
  }

  function handleError(ex, errNode) {
    if (ex.status === 401) return signOut(ex.message);
    setError(errNode, ex.message);
  }

  function buyCard() {
    const discount = me.discount_code && !me.discount_used && new Date(me.discount_deadline) > new Date();
    const url = (p) => {
      const q = new URLSearchParams({ client_reference_id: me.partner_id, prefilled_email: me.email });
      if (discount) q.set('prefilled_promo_code', me.discount_code);
      return `${p.url}?${q}`;
    };
    return el('section', { class: 'p-panel', 'aria-labelledby': 'buy-title' },
      el('h4', { id: 'buy-title', text: 'Buy more vouchers' }),
      discount
        ? el('p', { class: 'p-discount' }, el('strong', { text: '20% off your first pack' }), ` is applied for you: code ${me.discount_code}, until ${fmtDate(me.discount_deadline)}.`)
        : me.discount_used ? el('p', { class: 'p-muted', text: "You've used your 20% first-pack discount. Thank you!" }) : null,
      el('div', { class: 'p-packs' }, ...PACKS.map((p) => el('a', { class: 'p-pack', href: url(p), target: '_blank', rel: 'noopener' },
        el('span', { class: 'p-pack__size', text: `${p.size} vouchers` }),
        el('span', { class: 'p-pack__price', text: money(discount ? p.price * 0.8 : p.price) }),
        el('span', { class: 'p-pack__each', text: discount ? `was ${money(p.price)} · ${money(p.each * 0.8)} each` : `${money(p.each)} each` })))),
      el('p', { class: 'p-muted p-small', text: 'Each voucher gives one couple a full year of Premium. Prices exclude VAT. Vouchers you buy appear here straight away, ready to hand out.' }),
    );
  }

  // Printing: mark the next N vouchers as printed, then print a sheet of them.
  function printCard() {
    const available = me.vouchers.filter((v) => v.state === 'available');
    if (!available.length) return null;
    const sizes = [...new Set([1, 2, 4, 6, 8, 10, 20, available.length])].filter((n) => n <= available.length).sort((a, b) => a - b);
    const count = el('select', { 'aria-label': 'How many to print' },
      ...sizes.map((n) => el('option', { value: String(n), text: plural(n, 'voucher') })));
    const err = errorLine();
    const go = el('button', {
      type: 'button', class: 'p-btn', text: 'Print',
      onclick: async () => {
        setError(err, '');
        const picked = available.slice(0, Number(count.value));
        go.disabled = true;
        try {
          for (const v of picked) await call(`/vouchers/${encodeURIComponent(v.code)}/hand-out`, { method: 'POST', body: { via: 'print' } });
          printSheet.replaceChildren(...picked.map((v) => el('div', { class: 'ps-card' },
            el('p', { class: 'ps-brand', text: 'Duolign' }),
            el('p', { class: 'ps-head', text: `${v.duration_months} months of Duolign Premium, from ${me.business_name}` }),
            qrSvg(v.redeem_link, 4),
            el('p', { class: 'ps-code', text: v.code }),
            el('p', { class: 'ps-small', text: 'Scan, or go to duolign.co.uk/redeem and enter the code. One voucher covers you both.' }),
          )));
          window.print();
          load();
        } catch (ex) { go.disabled = false; handleError(ex, err); }
      },
    });
    return el('section', { class: 'p-panel', 'aria-labelledby': 'print-title' },
      el('h4', { id: 'print-title', text: 'Print vouchers' }),
      el('p', { class: 'p-muted p-small', text: "For welcome packs or cards. Each printed voucher has its own QR code. Add who you gave each one to in your list below afterwards." }),
      el('div', { class: 'p-inline' }, count, go), err);
  }

  const FILTERS = [
    ['all', 'All'], ['available', 'Ready'], ['handed_out', 'Handed out'], ['redeemed', 'Redeemed'], ['held', 'Not started'],
  ];
  const matches = (v) => {
    if (view.filter !== 'all' && v.state !== view.filter) return false;
    const q = view.search.trim().toLowerCase();
    return !q || [v.code, v.note, v.sent_to, v.redeemed_by].some((s) => s && s.toLowerCase().includes(q));
  };

  function statusText(v) {
    switch (v.state) {
      case 'available': return `Ready to hand out${v.valid_until ? ` · redeem by ${fmtDate(v.valid_until)}` : ''}`;
      case 'handed_out': return `${HANDED[v.handed_out_via] || 'Handed out'} on ${fmtShort(v.handed_out_at)}${v.sent_to ? ` to ${v.sent_to}` : ''} · not redeemed yet`;
      case 'held': return 'Redeemed · not started in the app yet';
      case 'redeemed': return `Redeemed on ${fmtDate(v.redeemed_at)}`;
      case 'expired': return 'Expired';
      default: return 'Cancelled by Duolign';
    }
  }

  function noteEditor(v) {
    const wrap = el('div', { class: 'p-note-row' });
    const label = v.note || (v.state === 'available' ? '' : 'Who was it for? Add a note');
    const text = el('button', {
      type: 'button', class: v.note ? 'p-note-text' : 'p-note-text p-note-empty', text: label,
      hidden: v.state === 'available' && !v.note,
      onclick: () => {
        const input = el('input', { type: 'text', maxlength: String(NOTE_LIMIT), value: v.note || '', 'aria-label': `Note for ${v.code}` });
        const err = errorLine();
        const save = async () => {
          try {
            const r = await call(`/vouchers/${encodeURIComponent(v.code)}/note`, { method: 'PUT', body: { note: input.value } });
            v.note = r.note;
            wrap.replaceWith(noteEditor(v));
          } catch (ex) { handleError(ex, err); }
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') wrap.replaceWith(noteEditor(v)); });
        wrap.replaceChildren(input, el('button', { type: 'button', class: 'p-btn p-btn--small', text: 'Save', onclick: save }), err);
        input.focus();
      },
    });
    wrap.append(text);
    return wrap;
  }

  function voucherRow(v) {
    const actions = el('div', { class: 'p-row__actions' });
    if (v.state === 'available') {
      actions.append(el('button', { type: 'button', class: 'p-btn p-btn--small', text: 'Hand out', onclick: () => openHandOut(v) }));
    }
    if (v.state === 'handed_out' && v.handed_out_via !== 'email') {
      actions.append(
        el('button', { type: 'button', class: 'p-btn p-btn--small', text: 'Copy link', onclick: async (e) => {
          const ok = await copyText(v.redeem_link);
          e.target.textContent = ok ? 'Copied' : 'Copy failed';
          setTimeout(() => { e.target.textContent = 'Copy link'; }, 1600);
        } }),
        el('button', { type: 'button', class: 'p-btn p-btn--small', text: 'QR code', onclick: () => openQr(v) }),
      );
    }
    return el('li', { class: `p-row p-row--${v.state}` },
      el('div', { class: 'p-row__main' },
        noteEditor(v),
        el('p', { class: 'p-row__status', text: statusText(v) }),
        v.redeemed_by ? el('p', { class: 'p-row__shared', text: `Your client let you know it was them: ${v.redeemed_by}` }) : null,
        el('p', { class: 'p-row__code', text: v.code })),
      actions);
  }

  function openHandOut(v) {
    const slot = document.getElementById('handout-slot');
    slot.replaceChildren(handOutPanel(v));
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const input = slot.querySelector('input');
    if (input) input.focus();
  }

  function openQr(v) {
    const dialog = el('dialog', { class: 'p-dialog', 'aria-label': `QR code for ${v.note || v.code}` },
      el('p', { class: 'p-ok', text: v.note ? `For ${v.note}` : 'Scan to redeem' }),
      qrSvg(v.redeem_link, 8),
      el('p', { class: 'p-code p-center', text: v.code }),
      el('button', { type: 'button', class: 'btn-primary', text: 'Close', onclick: () => { dialog.close(); dialog.remove(); } }));
    document.body.append(dialog);
    dialog.showModal();
  }

  function voucherList() {
    const section = el('section', { class: 'p-list', 'aria-labelledby': 'list-title' });
    const search = el('input', { type: 'search', placeholder: 'Search names or codes', value: view.search, 'aria-label': 'Search your vouchers' });
    const chips = el('div', { class: 'p-chips', role: 'tablist', 'aria-label': 'Show' },
      ...FILTERS.map(([key, label]) => {
        const n = key === 'all' ? me.vouchers.length : me.vouchers.filter((v) => v.state === key).length;
        return el('button', {
          type: 'button', role: 'tab', class: 'p-chip', 'aria-selected': String(view.filter === key), text: `${label} ${n}`,
          onclick: () => { view.filter = key; render(); },
        });
      }));
    search.addEventListener('input', () => { view.search = search.value; renderList(); });
    const body = el('div', { id: 'list-body' });
    const renderList = () => {
      body.replaceChildren(...me.packs.map((pk) => {
        const all = me.vouchers.filter((v) => v.pack === pk.id && matches(v));
        if (!all.length) return null;
        // In "All", the vouchers a business has used come first and the
        // unused ones fold into one line (the hand-out panel picks the next
        // one anyway); searching or filtering shows them in full.
        const fold = view.filter === 'all' && !view.search.trim();
        const used = all.filter((v) => v.state !== 'available');
        const ready = all.filter((v) => v.state === 'available');
        const openReady = view.shown[`${pk.id}:ready`];
        const rows = fold ? used.concat(openReady ? ready : []) : all;
        const limit = view.shown[pk.id] || PAGE;
        const title = pk.kind === 'complimentary' ? 'Your free vouchers' : `Pack of ${pk.quantity} · bought ${fmtDate(pk.created_at)}`;
        return el('div', { class: 'p-pack-group' },
          el('div', { class: 'p-group__head' },
            el('h5', { text: title }),
            el('span', { class: 'p-muted p-small', text: `${pk.redeemed + pk.held} redeemed · ${pk.handed_out} handed out · ${pk.available} ready` })),
          rows.length ? el('ul', { class: 'p-rows' }, ...rows.slice(0, limit).map(voucherRow)) : null,
          fold && ready.length && !openReady
            ? el('button', { type: 'button', class: 'p-ready', onclick: () => { view.shown[`${pk.id}:ready`] = true; renderList(); } },
              el('span', { text: `${plural(ready.length, 'voucher')} ready to hand out` }), el('span', { class: 'p-ready__show', text: 'Show' }))
            : null,
          rows.length > limit ? el('button', { type: 'button', class: 'p-link', text: `Show ${Math.min(PAGE, rows.length - limit)} more`, onclick: () => { view.shown[pk.id] = limit + PAGE; renderList(); } }) : null);
      }).filter(Boolean));
      if (!body.childNodes.length) body.append(el('p', { class: 'p-muted', text: 'No vouchers match.' }));
    };
    renderList();
    section.append(
      el('div', { class: 'p-list__head' }, el('h4', { id: 'list-title', text: 'Your vouchers' }), search),
      chips, body);
    return section;
  }

  function render() {
    show(
      el('div', { class: 'p-top' },
        el('div', {},
          el('h3', { text: me.business_name }),
          el('p', { class: 'p-muted p-small', text: `Signed in as ${me.email}` })),
        el('button', { type: 'button', class: 'p-link', text: 'Sign out', onclick: () => signOut() })),
      statTiles(),
      el('div', { class: 'p-grid' },
        el('div', { id: 'handout-slot' }, handOutPanel()),
        el('div', { class: 'p-side' }, buyCard(), printCard())),
      voucherList(),
      el('p', { class: 'form-note' }, 'Each voucher is for one couple: give it to one of them, and their partner gets Premium too when they join the household in the app. Questions: ',
        el('a', { class: 'inline', href: 'mailto:support@duolign.co.uk', text: 'support@duolign.co.uk' })),
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
      me = await call('/me');
      return me.terms_accepted ? render() : renderTerms(me);
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
