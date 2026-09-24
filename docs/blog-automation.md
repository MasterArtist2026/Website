# Connecting an AI blog tool

Blog posts live in the Supabase table `blog_posts`. The website shows every row
where `published = true` on **blog.html** (list) and **post.html?slug=…** (article).
No website changes or redeploys are needed to publish a post.

## One-time setup
1. Run `supabase/blog.sql` in the Supabase SQL Editor.
2. In Supabase → Project Settings → API Keys, copy the **secret** (service_role) key.
   Put it **only** in the AI tool's settings. Never put it in the website or share it —
   it bypasses all database security.

## How the tool creates a post
Send an HTTP `POST` to:

    https://fudaosneozobacdalncv.supabase.co/rest/v1/blog_posts

Headers:

    apikey: <secret key>
    Authorization: Bearer <secret key>
    Content-Type: application/json
    Prefer: return=representation

Body (JSON):

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | URL name, lowercase words joined by hyphens, e.g. `why-kids-should-learn-piano`. Must be unique. |
| `title` | yes | Article title. |
| `body_html` | yes | Article body as HTML (`<h2>`, `<p>`, `<ul>`, `<img>`, `<a>` …). Scripts, styles, forms and iframes are stripped automatically. Don't repeat the title as an `<h1>`. |
| `excerpt` | recommended | 1–2 sentences shown on the blog list. |
| `seo_description` | optional | Google description (max ~155 characters). Falls back to `excerpt`. |
| `cover_image` | optional | Full image URL (or a site image like `art-photo-1.jpg`). |
| `cover_alt` | optional | Describes the cover image. |
| `tags` | optional | e.g. `["Music", "Parents"]` — shown as filters on the blog page. |
| `author` | optional | Defaults to "Master Artist". |
| `published` | optional | `true` publishes immediately. Leave `false` to save a draft for review. |
| `published_at` | optional | Schedule a post for later (ISO date). Set automatically on publish if empty. |

Example:

```json
{
  "slug": "5-signs-your-child-is-ready-for-piano",
  "title": "5 signs your child is ready for piano lessons",
  "excerpt": "Not sure if it's the right time to start? Here's what our teachers look for.",
  "body_html": "<p>...</p><h2>1. They hum along to music</h2><p>...</p>",
  "tags": ["Music", "Parents"],
  "published": false
}
```

To update a post, send `PATCH` to `.../rest/v1/blog_posts?slug=eq.<slug>` with the changed fields.

## Reviewing and unpublishing
Supabase → Table Editor → `blog_posts`: tick or untick `published`. Unpublished
posts disappear from the site immediately.

**Recommendation:** start with the tool saving drafts (`published: false`) and
approve each post yourself for the first few weeks. AI writing can state things
about your studio that aren't true (prices, class times, teacher credentials).
