# duolign-web

The marketing site for [Duolign](https://duolign.co.uk) — closed-beta
landing page + Privacy Policy / Terms of Service / Security pages.

Plain static HTML/CSS/JS, no build step, served by GitHub Pages at the
custom domain in `CNAME`. Design language mirrors the Duolign app
(`jeffnet-ltd/Couple_finance_app`, private): dark-first, the same
blue → indigo → violet accent gradient, monospace for every money figure.

## Structure

- `index.html` — the landing page
- `privacy.html`, `terms.html`, `security.html` — the legal pages
- `assets/styles.css` — shared styles (edit here, not per-page)
- `assets/site.js` — shared JS: the beta-signup form + year stamp
- `CNAME` — the custom domain GitHub Pages serves this at
- `sitemap.xml`, `robots.txt`

## The beta signup form

Writes directly to a `beta_signups` table in the **same Supabase project**
the app uses — see `db/migrations/0008_beta_signups.sql` in the
`Couple_finance_app` repo for the schema and RLS policy. The key embedded
in `assets/site.js` is the Supabase **anon** key: public by design (the
same one shipped in the app bundle), and Row Level Security restricts it
to `INSERT` only on that one table — it can't read, update, or delete
anything. There is no secret in this repo.

To read the signups: query `beta_signups` from the Supabase dashboard
(service-role access) or via `psql`/the app's own `DATABASE_URL`.

## Updating

Edit the files and push to `main` — GitHub Pages redeploys automatically
within a minute or two. There's no build step.

## Custom domain

DNS for `duolign.co.uk` should point at GitHub Pages:

- **Apex (`duolign.co.uk`)**: four `A` records to
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- **`www.duolign.co.uk`** (optional): a `CNAME` record to
  `jeffnet-ltd.github.io`

Once DNS resolves, enable **Settings → Pages → Enforce HTTPS** in this
repo (GitHub provisions the certificate automatically, can take up to an
hour after DNS propagates).
