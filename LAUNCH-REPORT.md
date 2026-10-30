# Launch report — rebuild-2026

Checked 30 October 2026 on the `rebuild-2026` branch, against the acceptance checklist in the handoff's
site spec (§10). Not yet merged: merging to `main` is what puts the new site live.

## Checklist

| Check | Result | Notes |
| --- | --- | --- |
| All routes built | **Pass** | Home, Classes + 6 programmes, Workshops + 7 format pages + 13 dated pages, This Sunday, Groups, Birthdays, Holiday Camps, Prices, Gift Vouchers, About, Teachers, Reviews, Showcase, Trial, Terms, Privacy. The spec's "10 format pages" is now 7: Sabrina's November schedule pauses six formats and adds three (Glow, Candle Making, Chunky Crochet). |
| No hard-coded prices | **Pass** | `grep -nE "RM ?[0-9]"` on `scripts/build_site.py` and `assets/ma.js` finds nothing outside `rm()`. The trial price and the schema price range now come from the data too. |
| WhatsApp pre-fill on 5 pages; `whatsapp_click` fires | **Pass** | Format page, dated session (pair + Dine), Bake Lab (kitchen consent), class page (trial), groups quote form. UTM source carried across pages (`Source: meta/launch`). |
| Booking embed; `booking_started` with `session_id` | **Pass, with a change** | No Tuesday Textured Canvas or Sunday-morning Bake Lab exists in the new schedule; tested on Tue 10 Nov Watercolour Cake (Dine) and Sun 29 Nov Gingerbread 3pm. Two-time days (Sunday 10am/3pm) fire `booking_started` only for the time chosen. |
| Format page: next four dates; `/this-sunday/`; sold out → next date | **Pass** | Sold-out tested with a temporary booking (button goes to the next date; schema switches to SoldOut); "Nearly full" under six seats. Data restored afterwards. |
| Consent on kids and baking bookings | **Partly** | Baking consent (kitchen notice, allergies) passes. No kids workshop is on sale in November (Family Sunday paused), so the child consent fields render only on the styleguide; they come back automatically when a kids format is scheduled. |
| Mobile 390px: price and button above the fold | **Pass** | Session page: price at 581px, WhatsApp button at 782px (screen 844px). Class page: price at 431px, trial button at 478px. No sideways scroll on any page checked. |
| Lighthouse mobile: performance ≥ 90, accessibility ≥ 95 | **Accessibility pass; performance fail** | See below. |
| Redirects, sitemap, schema | **Pass** | 11 old pages redirect and keep UTMs; sitemap lists 43 pages plus 10 blog posts; 67 JSON-LD blocks parse (LocalBusiness sitewide, Event on dated sessions, Course on programmes); `tools/test_public_seo.py` passes. |
| TODO list delivered | **Pass** | Below. |

## Lighthouse (mobile, compressed like GitHub Pages)

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/` | 68 | 95 | 75 | 100 |
| `/workshops/acrylic-canvas/2026-11-08/` | 63 | 97 | 79 | 100 |
| `/classes/kids-art-younger/` | 69 | 96 | 75 | 100 |

Fixed during the check: gold text on light backgrounds darkened to `--gold-text` (#7E5A10) for AA contrast;
heading order; the time chooser's ARIA role; footer link contrast; 640px photo copies in `assets/img/`
served to phones through `srcset`; one Fraunces weight dropped; preconnects to the tag servers.

What holds performance under 90 is third-party script: Google tag, Tag Manager and the Meta pixel are about
640 KB together, more than the site itself. Reaching 90 means loading them after the page is interactive,
which can lose page views from people who leave quickly (Meta ad clicks especially). That is a decision for
David, not a fix to make quietly. Best practices loses points only to the third-party cookies those tags set.

## TODO

Photos
- No photo yet for Glow-in-the-Dark, Candle Making, Chunky Crochet (they show the name on a plain panel).
- Several adult workshop cards use photos with children (e.g. Textured Canvas); replace with adult sessions after 4–8 Nov.
- Student work with ages for the class pages.

Teachers
- Bios for Beverly Thien and Ana Castro; a photo of Beverly.
- Teachers for Glow, Candle Making and Chunky Crochet (no "who runs it" on those pages until set in `data/teachers.json`).

Reviews
- `data/reviews.json` has no hand-picked quotes; the pages use the live Google reviews only.

Content and prices to confirm (Sabrina)
- Prices for Glow (RM85), Candle Making (RM89), Chunky Crochet (RM95): on the site as suggestions.
- Open Day times (the banner says "Ask about the Open Day").
- Thursday "Small & Big kids" and "Junior": classes or workshops, ages, prices (not on the site).
- December and January workshops: after 29 November the site shows no workshop dates.
- Birthday package prices (suggested); gift voucher validity; Studio Pass on sale or not; registration fee.
- Class-page level descriptions in `data/programme-copy.json` are drafts for CY and Sabrina to check.
- PDPA notice: the current text is the old policy updated for the new booking fields; replace if a reviewed version exists.

Booking tool and tracking
- Bookings run through WhatsApp; no payment tool is chosen, so there are no booking-tool credentials and `booking_paid` never fires yet.
- Import `docs/gtm-container.json` into GTM-5J4LPRBN, publish, then set `tracking.direct_tags` to `false` in `data/site.json`.
- Meta Conversions API: token into Supabase secret `META_CAPI_TOKEN`, deploy `supabase/functions/meta-capi`, then set `tracking.capi` to `true`.
- GitHub secret `WORKSHOPS_PRIVATE_JSON` for the nightly session roll (keeps the 1 May price step out of the public repo).

## Three things most likely to break on Sunday morning

1. **The merge itself.** The live site changes only when `rebuild-2026` is merged to `main`. The hourly blog
   build and the nightly session roll both commit to `main`; merge when neither is running (avoid :17 past the
   hour), then open `/`, `/workshops/` and one old URL (`/music.html`) on a phone within five minutes.
2. **WhatsApp volume.** Every booking, trial and quote lands on +60 10-277 9426 as a pre-filled message, with no
   payment step and no auto-responder yet. If replies slip past 15 minutes on Open Day and the first ad
   weekend, seats are lost. Someone owns the phone on Sunday 1 and Monday 2 November.
3. **Tracking double-counting or silence.** Today the direct GA4 and Meta tags fire and the GTM container is
   empty. If the GTM import is published without flipping `direct_tags` off, every event counts twice; if the
   flag is flipped before GTM is published, nothing is counted. Check GA4 DebugView and Meta Events Manager
   right after either change.
