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

// Two-step flow: step 1 (email only) reveals step 2 (the 3 optional
// research selects + the feedback-chat checkbox) client-side -- no
// Supabase write happens until step 2 actually completes (either its
// own submit, or Skip). Exactly one insert either way, so the RLS
// policy stays anon-insert-only with no UPDATE ever needed.
function wireSignupForm(form) {
  if (!form) return;
  const source = form.dataset.source || 'landing';
  const note = document.getElementById(form.id + '-note');
  const error = document.getElementById(form.id + '-error');
  const done = document.getElementById(form.id + '-done');
  const step1 = form.querySelector('.signup-step1');
  const step2 = form.querySelector('.signup-step2');
  const input = form.querySelector('input[type=email]');
  const skipBtn = step2.querySelector('[data-action=skip]');
  const partnerStatus = form.querySelector('select[name=partner_status]');
  const splitStyle = form.querySelector('select[name=split_style]');
  const currentTools = form.querySelector('select[name=current_tools]');
  const feedbackOptIn = form.querySelector('input[name=feedback_opt_in]');

  function validEmail() {
    const email = (input.value || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input.focus();
      input.style.borderColor = '#dc2626';
      return null;
    }
    input.style.borderColor = '';
    return email;
  }

  async function finish(includeExtras, triggerBtn) {
    const email = validEmail();
    if (!email) return;
    if (error) error.hidden = true;
    if (!client) {
      if (error) { error.hidden = false; error.textContent = "Couldn't reach the sign-up list — please try again shortly."; }
      return;
    }
    const originalText = triggerBtn.textContent;
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Joining…';
    // The 3 research selects + the checkbox are optional (no
    // `required`) -- an unset select submits '' as its value,
    // normalised to null so the column stays genuinely empty rather
    // than storing an empty string. Skip sends every optional field
    // as null/false regardless of any partial selection made before
    // it was clicked -- "skip" means skip, not "whatever's there".
    const { error: dbError } = await client.from('beta_signups').insert({
      email,
      source,
      partner_status: includeExtras ? (partnerStatus?.value || null) : null,
      split_style: includeExtras ? (splitStyle?.value || null) : null,
      current_tools: includeExtras ? (currentTools?.value || null) : null,
      feedback_opt_in: includeExtras ? Boolean(feedbackOptIn?.checked) : null,
    });
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalText;
    if (dbError) {
      if (error) { error.hidden = false; error.textContent = "Something went wrong — please try again."; }
      return;
    }
    form.hidden = true;
    if (note) note.hidden = true;
    if (done) done.hidden = false;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step2.hidden) {
      if (!validEmail()) return;
      step1.hidden = true;
      step2.hidden = false;
      return;
    }
    finish(true, step2.querySelector('button[type=submit]'));
  });

  skipBtn.addEventListener('click', () => finish(false, skipBtn));
}

wireSignupForm(document.getElementById('join'));
wireSignupForm(document.getElementById('join2'));

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
