# Blog agent — writing guide

Rules for the scheduled Claude agent that drafts Master Artist blog posts.
The owner approves every draft before it is published.

## Facts: only from the website
Every fact about Master Artist — programmes, ages, prices, teachers, times,
location — must come from the current website files in this repository
(index.html, music.html, orchestra.html, art.html, media.html, workshops.html,
pricing.html, visit.html, about.html). If a fact isn't on the site, don't state
it. Never invent testimonials, student names, statistics, awards or events.

Key facts (check the files — they win if these ever differ):
- Location: 38-2, Jalan 28/70A, Desa Sri Hartamas, KL — upstairs, above Savor.
  A short drive from Mont Kiara.
- Hours: Sun–Thu 10:30am–7pm, Fri 10:30am–4pm, closed Saturdays (Sabbath).
- Trial: any class RM50, credited in full to the first month.
- Founder Sabrina Hew teaches voice; Cheong Chui Yen teaches art; Alden teaches
  photography; Zimin teaches videography & film.
- Mont Kiara Orchestra: every Friday 3pm, open to musicians of any school,
  2–4 performances a month.

General facts from research (child development, how-to tips) are fine, but keep
claims modest and never give medical or legal advice.

## Voice
Warm, practical and confident — written for busy parents in KL (and adult
learners). Plain British/Malaysian English (colour, practise, programme).
Short paragraphs. No hype words ("revolutionary", "best in Malaysia"), no
emoji, no exclamation marks in headings.

## Format (HTML body, no <h1> — the page adds the title)
- 900–1,400 words.
- Open with a 2–3 sentence answer to the question in the title (this is what
  Google AI Overviews and ChatGPT quote).
- 4–6 <h2> sections; <h3> only when needed. Lists where they help.
- A short "Frequently asked questions" <h2> near the end with 3–4 questions,
  each as <h3> + <p>.
- 2–4 internal links using root paths, e.g. <a href="/music.html#piano">piano lessons</a>,
  plus 1–2 links to reputable external sources where a claim needs one.
- End with a short paragraph inviting a RM50 trial, linking to /pricing.html#trial
  or the relevant programme page.
- Allowed tags: p, h2, h3, ul, ol, li, strong, em, a, blockquote, img, figure,
  figcaption, table, thead, tbody, tr, th, td.

## Metadata
- slug: lowercase words joined by hyphens, 3–7 words, contains the search phrase.
- title: under 60 characters, contains the search phrase.
- seo_description: 140–155 characters, includes "KL" or "Mont Kiara" where natural.
- excerpt: 1–2 sentences for the blog list.
- tags: 1–3 of: Music, Orchestra, Art, Design, Photography, Videography,
  Baking, Parents, Adults, Holidays.
- cover_image: one existing site photo that fits, as a root path, e.g.
  /piano-photo.jpg. Choose from: /hero-1.jpg /vocal-singing.jpg
  /vocal-teaching-1.jpg /vocal-teaching-2.jpg /piano-photo.jpg /art-photo-1.jpg
  /art-photo-2.jpg /art-photo-3.jpg /art-photo-4.jpg /baking-1.jpg /baking-2.jpg
  /baking-3.jpg /painting-1.jpg /painting-2.jpg /painting-3.jpg /painting-4.jpg
  /craft-1.jpg /craft-2.jpg /craft-jars.jpg /craft-mirror.jpg
- cover_alt: describes the photo.
