# Website

## Studio leads (private CRM)

The public trial and workshop forms save one row in `public.leads`. Staff read and update those rows at `/admin/` after signing in. That page is `noindex`, left out of `robots.txt`, and it is not in the public navigation. The content admin sidebar links to it once you are signed in.

Nothing here is applied by a GitHub Pages deploy. The forms show an error, and they do not send `generate_lead`, until the migration below has been run.

### 1. Run the migration

In the Supabase SQL editor for project `fudaosneozobacdalncv`, run:

`supabase/migrations/20261102011500_crm.sql`

That creates `contacts`, `leads`, `workshops`, `bookings` and `activities`, turns on row level security, and grants the `crm` section to the admin, marketing and teacher roles. Visitors can insert a new lead and nothing else. Only an authenticated person with an active profile and that section can read or change the data.

`trial_leads` is left as it is. New saves go to `leads`.

Draft pull request #4 (`cursor/studio-sessions-booking-80db`) also creates a table named `public.bookings`, for Studio Sessions checkout. Do not run that migration after this one until its table is renamed (for example to `studio_bookings`). This branch is based on `main`. The booking and enquiry forms from that pull request are not in this branch. `site.js` still listens for `form.book-form` and `form.enquiry-form`: when the two branches are merged, those forms save a lead before their own checkout or enquiry handler runs. Expect a conflict in `site.js` around the form code; keep both the lead save and the Studio Sessions checkout.

### 2. Create a staff user

People who already have an active profile (the content admin) can open `/admin/` and sign in.

For someone new:

1. In the content admin, open People & Access and invite their email with the role you want. That writes `invited_people`. The database creates an active profile the first time they sign in.
2. Or, in Supabase, Authentication → Users → Add user, then set `profiles.active` and `profiles.role`.
3. They can use an email sign-in link (the same mail setup as the content admin) or a password. A password has to be set on the user in Authentication → Users. The link only returns to the admin if this URL is allowed: Authentication → URL configuration → Redirect URLs → `https://masterartist.co/admin/`.

A signed-in person with no active profile sees a locked message and cannot read leads.

### 3. What David does by hand

- Run the SQL file above. The site deploy will not.
- Add `https://masterartist.co/admin/` to the Auth redirect URLs before using the email link.
- Confirm the content-admin SMTP settings still send mail.
- Optional: in GA4 Admin → Events, disable create-event rule `16134847184`. It copies every page view on this domain into `generate_lead`. The site now drops those copies unless a form has just saved a row, and it sends `generate_lead` once per save. The rule is still worth turning off so the numbers do not depend on the browser.
- Google Ads: `/workshops/textured-canvas/` is not a page in this repository (it 404s on the live site). If a conversion action there counts a page load, change that action in Google Ads. The site itself now keeps each Ads conversion label to one hit per page, plus one more when a trial form or a WhatsApp button actually fires.
- After the migration, send one test enquiry and delete that lead from `/admin/`.
- Add workshops (title, date, capacity, price, early-bird price, ad spend) in `/admin/` so the seats and cost-per-booking view has something to show.

Quick-add on `/admin/#add` is for logging a WhatsApp chat that never touched the website form.