# Bookings, online payment and the customer CRM

Once all this is set up, the website, Stripe and the CRM work together like this:

- **A booking:** on a dated workshop page, the customer fills in the form and presses **Pay RM… and book**. They pay by card, FPX online banking or e-wallet on Stripe's secure page. The booking is then marked **paid** by itself, and they land on a thank-you page with the RM50 trial-class voucher. Stripe emails them the receipt.
- **The CRM:** every booking and every trial request creates or updates one customer in **admin.html → Customers**. Each customer has:
  - name, WhatsApp number and email
  - children's names and ages
  - every booking and trial request
  - total paid, where they first came from, and whether they want news
  - notes and tags
- **Sabrina's report:** for every paid booking (or WhatsApp request), Sabrina gets the email with the session's attendee list, plus a WhatsApp alert.
- **Before Stripe is switched on:** bookings go through WhatsApp as now, and still reach the CRM and the report.

Do these once, in order. Steps 1–3 work without Stripe.

## 1. Database (Supabase → SQL Editor)

1. Go to **Project Settings → Vault → New secret**. Name it `booking_hook_secret` and give it a long random value. Keep the value; step 3 uses it.
2. Run `supabase/migrations/20261016115757_trial_leads.sql`, only if the `trial_leads` table doesn't exist yet.
3. Run `supabase/bookings.sql`.
4. Run `supabase/crm.sql`. It also creates customers from any bookings and trial requests already saved.

The checks at the end of each file should show that the website (`anon`) can only add rows, and that `admin` has the `bookings` and `customers` permissions. To give another role access, for example `marketing`, add `role_permissions` rows for those sections.

## 2. Email for Sabrina's report (Resend)

1. Create a free account at resend.com. Add the domain `masterartist.co` and add the DNS records it shows at the domain host.
2. Create an API key.

## 3. Edge Functions

Go to Supabase → Edge Functions → Secrets and add:

| Secret | Value |
| --- | --- |
| `BOOKING_HOOK_SECRET` | the same value as the Vault secret |
| `RESEND_API_KEY` | from Resend |
| `REPORT_EMAIL_TO` | Sabrina's email (comma-separate several) |

Then deploy the three functions:

```bash
supabase functions deploy booking-notify --no-verify-jwt --project-ref fudaosneozobacdalncv
```

```bash
supabase functions deploy create-checkout --project-ref fudaosneozobacdalncv
```

```bash
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref fudaosneozobacdalncv
```

## 4. Stripe (online payment)

1. Create Master Artist's own Stripe account at stripe.com. Use the business details and a Master Artist bank account, kept separate from Savor's. Stripe asks for identity and company documents, which can take a few days.
2. In **Settings → Payment methods**, turn on Cards, FPX and GrabPay. In **Settings → Customer emails**, turn on "Successful payments" so customers get receipts.
3. Start in **test mode**. Under Developers → API keys, copy the secret key (`sk_test_…`) into the Edge Function secret `STRIPE_SECRET_KEY`.
4. Under Developers → Webhooks, add an endpoint:
   - URL: `https://fudaosneozobacdalncv.supabase.co/functions/v1/stripe-webhook`
   - events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`

   Copy its signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
5. Ask Claude to set `payments.stripe` to `true` in `data/site.json` and publish. The booking button becomes **Pay RM… and book**.
6. Test it with Stripe's test card `4242 4242 4242 4242`, any future date and any CVC. Check:
   - the booking shows as **paid** in Bookings
   - the customer appears in Customers
   - the report email arrives
7. When the test works, switch Stripe to live mode. Repeat steps 3–4 with the live key and a live webhook, then make one real RM booking and refund it.

Seats are held for 35 minutes while someone is on the payment page. If they leave without paying, the booking becomes **expired** and the seats free up. Refunds made in Stripe set the booking to **refunded**.

## 5. WhatsApp alerts for Sabrina (optional, after the rest)

1. In WhatsApp Manager (Meta Business Suite), add a sending number. The Cloud API needs a number that isn't on the WhatsApp Business app, unless you use Meta's "coexistence" option.
2. Create a Utility template named `new_booking`, language English, with this body:
   `New booking: {{1}} for {{2}}, {{3}}. {{4}}. Full list in the admin portal.`
3. Add the secrets:
   - `WHATSAPP_TOKEN`: a System User permanent token with `whatsapp_business_messaging`
   - `WHATSAPP_PHONE_ID`: the sending number's Phone number ID
   - `WHATSAPP_TO`: Sabrina's number, for example `60123456789`

## Privacy

- Customers only receive marketing if they ticked **Send me news**. The Customers section has a **Want news** filter for that list.
- Card and bank details stay with Stripe and never reach the website or the CRM.
- Children's names are kept in the CRM and the admin portal only. They never appear in emails, on the site or in ads.
