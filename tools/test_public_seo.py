#!/usr/bin/env python3
"""Checks canonicals, the sitemap, lead SQL, and local blog drafts."""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://masterartist.co'
SKIP = {'admin.html', 'post.html', '404.html'}

def public_pages():
    pages = []
    for path in ROOT.rglob('*.html'):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith('blog/') or path.name not in SKIP and path.parent == ROOT:
            if path.name in SKIP:
                continue
            pages.append(rel)
    return sorted(pages)

def canonical_for(rel):
    if rel == 'index.html':
        return SITE + '/'
    return SITE + '/' + rel

def main():
    errors = []
    sitemap = (ROOT / 'sitemap.xml').read_text()
    robots = (ROOT / 'robots.txt').read_text()
    if 'Sitemap: https://masterartist.co/sitemap.xml' not in robots:
        errors.append('robots.txt does not reference the sitemap')
    pages = public_pages()
    if not pages:
        errors.append('no public pages found')
    for rel in pages:
        text = (ROOT / rel).read_text()
        want = canonical_for(rel)
        if f'<link rel="canonical" href="{want}">' not in text:
            errors.append(f'{rel} missing canonical {want}')
        if want not in sitemap:
            errors.append(f'sitemap missing {want}')
        if rel != 'index.html' and 'http://masterartist.co' in text:
            errors.append(f'{rel} has an http canonical or URL')
    # template and admin stay out of the sitemap
    for blocked in ('/admin.html', '/post.html', '/404.html'):
        if f'<loc>{SITE}{blocked}</loc>' in sitemap:
            errors.append(f'sitemap should not list {blocked}')
    if 'name="robots" content="noindex, follow"' not in (ROOT / 'post.html').read_text():
        errors.append('post.html template should stay noindex')

    sql = (ROOT / 'supabase/migrations/20261016115757_trial_leads.sql').read_text().lower()
    for needle in ('enable row level security', 'force row level security', 'trial_leads_anon_insert', "to anon", "default 'new'"):
        if needle not in sql:
            errors.append(f'migration missing {needle}')
    if re.search(r'grant\s+select\s+on\s+public\.trial_leads\s+to\s+anon', sql):
        errors.append('anon must not be granted select on trial_leads')
    if 'for select' in sql or 'for update' in sql or 'for delete' in sql:
        errors.append('trial_leads policies must be insert-only')

    js = (ROOT / 'site.js').read_text()
    for needle in ('PLACEHOLDER_GENERATE_LEAD', 'PLACEHOLDER_WHATSAPP_CLICK', "gtag('event', 'whatsapp_click'", "gtag('event', 'generate_lead'", "returning: 'minimal'", 'trial_leads'):
        if needle not in js:
            errors.append(f'site.js missing {needle}')
    if 'close_convert_lead' in js.split('function adsLead')[1]:
        errors.append('adsLead still sends close_convert_lead')

    sys.path.insert(0, str(ROOT / 'tools'))
    import build_blog
    local = build_blog.load_local_posts()
    slugs = {p['slug'] for p in local}
    if slugs != {'choosing-piano-or-vocal-lessons-mont-kiara', 'benefits-of-kids-art-classes'}:
        errors.append(f'unexpected local posts: {slugs}')
    merged = build_blog.merge_posts([{'slug': 'remote-only', 'published_at': '2026-01-01'}], local)
    merged_slugs = [p['slug'] for p in merged]
    if 'remote-only' not in merged_slugs or 'choosing-piano-or-vocal-lessons-mont-kiara' not in merged_slugs:
        errors.append('merge_posts dropped a post')
    # a remote row with the same slug wins
    overridden = build_blog.merge_posts(
        [{'slug': 'benefits-of-kids-art-classes', 'published_at': '2026-01-01', 'title': 'Remote'}],
        local,
    )
    winner = next(p for p in overridden if p['slug'] == 'benefits-of-kids-art-classes')
    if winner.get('title') != 'Remote':
        errors.append('remote post should win a slug clash')

    for post in local:
        seo = post.get('seo_description') or ''
        if not 140 <= len(seo) <= 155:
            errors.append(f"{post['slug']} seo_description length {len(seo)}")
        body = re.sub(r'<[^>]+>', ' ', post.get('body_html') or '')
        words = re.findall(r"[A-Za-z0-9’']+", body)
        if not 900 <= len(words) <= 1400:
            errors.append(f"{post['slug']} word count {len(words)}")
        page = ROOT / 'blog' / f"{post['slug']}.html"
        html = page.read_text()
        if 'noindex' in html:
            errors.append(f'{page.name} should be indexable')
        if f'<link rel="canonical" href="{SITE}/blog/{post["slug"]}.html">' not in html:
            errors.append(f'{page.name} canonical missing')

    # every JSON-LD block parses
    for path in list(ROOT.glob('*.html')) + list((ROOT / 'blog').glob('*.html')):
        for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', path.read_text(), re.S):
            try:
                json.loads(raw)
            except json.JSONDecodeError as exc:
                errors.append(f'{path.name} invalid JSON-LD: {exc}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)
    print(f'public seo checks passed ({len(pages)} pages)')

if __name__ == '__main__':
    main()
