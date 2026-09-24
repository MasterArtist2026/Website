# Google reviews on the website

The "What families tell us" section combines two sources:

1. **Live from Google** — star rating, review count and up to 5 reviews (Google
   chooses which). The website asks the Supabase Edge Function `google-reviews`,
   which calls Google's Places API (New) on the server. **The Google API key is
   stored only in Supabase's secrets** — it never appears in the website's code.
2. **Hand-picked** — quotes entered in the admin panel under Testimonials.
   Write `Google review` in the note field to show a Google badge on a quote
   copied from Google.

The section stays hidden until at least one source has content.

## One-time setup
1. **Create a server key** — Google Cloud → APIs & Services → Credentials →
   Create credentials → API key. Edit it:
   - *Application restrictions*: **None** (it's used from Supabase's servers, not a browser).
   - *API restrictions*: **Restrict key** → tick only **Places API (New)**.
2. **Store it in Supabase** — Supabase dashboard → Edge Functions → **Secrets** →
   add `GOOGLE_PLACES_KEY` = the key.
3. **Deploy the function** — Supabase dashboard → Edge Functions → **Deploy a new
   function → Via Editor**. Name it exactly `google-reviews`, paste the contents of
   `supabase/functions/google-reviews/index.ts`, and deploy.
4. **Limit spending** — Google Cloud → APIs & Services → Places API (New) →
   **Quotas**: set a daily request cap (e.g. 1,000). Billing → **Budgets & alerts**:
   set a low monthly budget alert.

## Google's display rules (already built in)
- Reviews show the reviewer's name, photo and date, with "Posted on Google".
- The Google logo and links to your profile and "Write a review" are shown.
- Review text isn't edited or stored by the website.

## Changing the website address
The function only answers requests from `masterartist.co`, `www.masterartist.co`
and `http://localhost:8765` (local preview). If the site moves, update
`ALLOWED_ORIGINS` in the function and redeploy.
