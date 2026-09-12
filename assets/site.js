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

document.querySelectorAll('#yr').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

function wireSignupForm(form) {
  if (!form) return;
  const source = form.dataset.source || 'landing';
  const note = document.getElementById(form.id + '-note');
  const error = document.getElementById(form.id + '-error');
  const done = document.getElementById(form.id + '-done');
  const button = form.querySelector('button');
  const input = form.querySelector('input[type=email]');
  const client = (window.supabase && SUPABASE_URL.startsWith('https://'))
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (input.value || '').trim();
    if (error) error.hidden = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      input.focus();
      input.style.borderColor = '#dc2626';
      return;
    }
    input.style.borderColor = '';
    if (!client) {
      if (error) { error.hidden = false; error.textContent = "Couldn't reach the sign-up list — please try again shortly."; }
      return;
    }
    button.disabled = true;
    button.textContent = 'Joining…';
    const { error: dbError } = await client.from('beta_signups').insert({ email, source });
    button.disabled = false;
    button.textContent = 'Join the waitlist';
    if (dbError) {
      if (error) { error.hidden = false; error.textContent = "Something went wrong — please try again."; }
      return;
    }
    form.hidden = true;
    if (note) note.hidden = true;
    if (done) done.hidden = false;
  });
}

wireSignupForm(document.getElementById('join'));
wireSignupForm(document.getElementById('join2'));
