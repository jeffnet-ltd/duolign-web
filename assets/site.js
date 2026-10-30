// Duolign marketing site.
//
// The beta-signup form writes to `beta_signups` in the SAME Supabase
// project the app uses (db/migrations/0008_beta_signups.sql in the
// Couple_finance_app repo). The key below is the ANON key -- public by
// design, the same one already shipped inside the mobile app bundle.
// Row Level Security on `beta_signups` allows this key to INSERT ONLY;
// it can never read, update or delete a row. There is nothing secret on
// this page.
const SUPABASE_URL = 'https://jqvknxxpeqlcmehheaaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmtueHhwZXFsY21laGhlYWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTE3NTksImV4cCI6MjEwMzQ2Nzc1OX0.hUJ4_D16845wdMwJFpEx-ue0EXkseQ1TNjfat7QY6w4';

// One shared client for the whole page -- both the signup insert and the
// beta-capacity read below use it, so there's exactly one client instance
// per page load instead of one per signup form.
const client = (window.supabase && SUPABASE_URL.startsWith('https://'))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

document.querySelectorAll('#yr').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

// The waitlist: an email address, saved straight away (2026-10-30; the
// optional research questions that used to follow it are gone). One
// insert, so the RLS policy stays anon-insert-only.
function wireSignupForm(form) {
  if (!form) return;
  const source = form.dataset.source || 'landing';
  const note = document.getElementById(form.id + '-note');
  const error = document.getElementById(form.id + '-error');
  const done = document.getElementById(form.id + '-done');
  const input = form.querySelector('input[type=email]');
  const button = form.querySelector('button[type=submit]');

  function validEmail() {
    const email = (input.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input.focus();
      input.style.borderColor = 'var(--danger)';
      return null;
    }
    input.style.borderColor = '';
    return email;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = validEmail();
    if (!email) return;
    if (error) error.hidden = true;
    if (!client) {
      if (error) { error.hidden = false; error.textContent = "Couldn't reach the sign-up list. Please try again shortly."; }
      return;
    }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Joining…';
    const { error: dbError } = await client.from('beta_signups').insert({ email, source });
    button.disabled = false;
    button.textContent = originalText;
    if (dbError) {
      if (error) { error.hidden = false; error.textContent = 'Something went wrong. Please try again.'; }
      return;
    }
    form.hidden = true;
    if (note) note.hidden = true;
    if (done) done.hidden = false;
  });
}

wireSignupForm(document.getElementById('join'));
wireSignupForm(document.getElementById('join2'));

// delete-data.html's request form -- App Store review's web-reachable
// deletion path, for someone who'd rather not reinstall the app just to
// leave. Inserts into `deletion_requests` (Couple_finance_app's
// db/migrations/0019_deletion_requests.sql), the SAME anon-insert-only
// RLS pattern as beta_signups above -- this key can add a row, never
// read the queue back. A Supabase Database Webhook on that table emails
// the owner, and the admin dashboard lists it for them to resolve by
// hand (never automatic -- someone's real financial data, verified
// before it's erased).
function wireDeletionForm(form) {
  if (!form) return;
  const note = document.getElementById(form.id + '-note');
  const error = document.getElementById(form.id + '-error');
  const done = document.getElementById(form.id + '-done');
  const emailInput = form.querySelector('input[type=email]');
  const messageInput = form.querySelector('textarea');
  const submitBtn = form.querySelector('button[type=submit]');

  function validEmail() {
    const email = (emailInput.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.focus();
      emailInput.style.borderColor = 'var(--danger)';
      return null;
    }
    emailInput.style.borderColor = '';
    return email;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = validEmail();
    if (!email) return;
    if (error) error.hidden = true;
    if (!client) {
      if (error) { error.hidden = false; error.textContent = "Couldn't reach our database — please email support@duolign.co.uk instead."; }
      return;
    }
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    const { error: dbError } = await client.from('deletion_requests').insert({
      email,
      message: (messageInput?.value || '').trim() || null,
    });
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    if (dbError) {
      if (error) { error.hidden = false; error.textContent = "Something went wrong — please email support@duolign.co.uk instead."; }
      return;
    }
    form.hidden = true;
    if (note) note.hidden = true;
    if (done) done.hidden = false;
  });
}

wireDeletionForm(document.getElementById('delete-form'));

// Beta-capacity copy swap. The HTML's own `.beta-status` text is already
// the correct, honest default ("open" copy) -- this only ever UPGRADES
// it to the "full" copy once real_household_count() (db/migrations/
// 0010_beta_signup_research_and_count.sql in Couple_finance_app)
// confirms the founder's decided 50-household cap is hit. Fails open on
// any error (network hiccup, RPC missing) -- never blocks the page, and
// worst case just shows "open" copy a little past the real cap, never
// the reverse.
const BETA_STATUS_FULL = 'The beta is now full — join the waitlist to be notified when we launch.';

async function initBetaStatus() {
  const targets = document.querySelectorAll('.beta-status');
  if (targets.length === 0 || !client) return;
  try {
    const { data, error } = await client.rpc('real_household_count');
    if (error || typeof data !== 'number' || data < 50) return;
    targets.forEach((el) => { el.textContent = BETA_STATUS_FULL; });
  } catch {
    // Network hiccup -- leave the default "open" copy in place.
  }
}
initBetaStatus();
