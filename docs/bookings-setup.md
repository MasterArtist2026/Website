# Bookings: admin portal and Sabrina's report

What it does once switched on:

- Every booking sent from a workshop date page is saved in Supabase (`workshop_bookings`) as **requested**, then WhatsApp opens as before.
- **admin.html → Bookings** lists every upcoming session with:
  - seats taken out of the cap
  - pairs and Savor meals
  - allergies and photo consent
  - the amount paid and still to collect
  - a status for each booking (requested, confirmed, paid, cancelled or refunded)
  - a CSV download

  A second tab lists the trial class requests (`trial_leads`).
- Each new booking emails Sabrina the full list for that session and sends her a short WhatsApp alert with the seat count. Children's names are never sent in either message.
- When Stripe goes live, a paid booking will move to **paid** by itself.

Each step is done once, in this order.

## 1. Database (Supabase → SQL Editor)

1. Go to **Project Settings → Vault → New secret**. Name it `booking_hook_secret` and give it a long random value. Keep the value; step 3 uses it.
2. Run `supabase/bookings.sql`. The two checks at the end should show:
   - `anon` with INSERT only
   - an `admin` row for the `bookings` section

   To let another role see bookings (for example `marketing`), add a `role_permissions` row with section `bookings`.

Bookings made before this step aren't saved; they still arrive on WhatsApp.

## 2. Email (Resend)

1. Create a free account at resend.com. Add the domain `masterartist.co` and add the DNS records it shows at the domain host.
2. Create an API key.

## 3. Edge Function secrets and deploy

Go to Supabase → Edge Functions → Secrets and add:

| Secret | Value |
| --- | --- |
| `BOOKING_HOOK_SECRET` | the same value as the Vault secret |
| `RESEND_API_KEY` | from Resend |
| `REPORT_EMAIL_TO` | Sabrina's email (comma-separate several) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TO` | step 4; leave these out until then |

Deploy the function without JWT checks. The database trigger calls it with the shared secret instead:

```bash
supabase functions deploy booking-notify --no-verify-jwt --project-ref fudaosneozobacdalncv
```

## 4. WhatsApp alerts (WhatsApp Cloud API)

1. In Meta Business Suite, open WhatsApp Manager and add a sending number. The Cloud API needs a number that isn't already on the WhatsApp Business app, unless you use Meta's "coexistence" option for the studio number.
2. Create a message template:
   - name `new_booking`, category Utility, language English
   - body: `New booking: {{1}} for {{2}}, {{3}}. {{4}}. Full list in the admin portal.`

   Wait for Meta to approve it.
3. Create a System User with a permanent token that has `whatsapp_business_messaging`.
4. Add the Edge Function secrets:
   - `WHATSAPP_TOKEN`: the permanent token
   - `WHATSAPP_PHONE_ID`: the sending number's Phone number ID
   - `WHATSAPP_TO`: Sabrina's number, for example `60123456789`

Until this is set up, only the email goes out. The function reports "whatsapp not configured" and carries on.

## 5. Test

Book a seat on any dated workshop page with your own name and number. Check:

- The booking shows in admin.html → Bookings within a few seconds.
- The email has arrived, and the WhatsApp alert too once step 4 is done.

Then set the test booking to **cancelled**.
