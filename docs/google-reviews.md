# Google reviews on the website

The "What families tell us" section combines two sources:

1. **Live from Google** — star rating, review count and up to 5 reviews (Google
   chooses which), loaded from the Places API on each page view.
2. **Hand-picked** — quotes entered in the admin panel under Testimonials.
   Write `Google review` in the note field to show a Google badge on a quote
   copied from Google.

The section stays hidden until at least one source has content.

## Turning on the live block (one-time, ~10 minutes)
1. Go to https://console.cloud.google.com and create a project (e.g. "Master Artist website").
2. **Billing → link a billing account.** Google requires one for the Places API.
   Set a budget alert (Billing → Budgets & alerts), e.g. RM20/month, so you're warned early.
3. **APIs & Services → Library** → enable **Maps JavaScript API** and **Places API (New)**.
4. **APIs & Services → Credentials → Create credentials → API key.** Then edit the key:
   - *Application restrictions* → **Websites** → add `https://masterartist.co/*`,
     `https://www.masterartist.co/*` and, for testing, `http://localhost:8765/*`.
   - *API restrictions* → **Restrict key** → tick only Maps JavaScript API and Places API (New).
5. Paste the key into `GOOGLE_MAPS_KEY` at the top of `site.js`.
6. Open the site, open the browser console, and copy the **Place ID** it prints
   into `GOOGLE_PLACE_ID`. (This saves one lookup per page view.)

Because the key is restricted to your domain and these two APIs, it's safe for it
to be visible in the page source — that's how Google intends browser keys to work.

## Google's display rules (already built in)
- Reviews show the reviewer's name, photo and date, with "Posted on Google".
- The Google logo and links to your profile and "Write a review" are shown.
- Review text isn't edited or stored by the website.
