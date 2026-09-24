#!/usr/bin/env python3
"""Builds a static HTML page for every published blog post.

Reads published posts from the Supabase view `blog_public`, writes
blog/<slug>.html using post.html as the page template (so posts get the
site's header, footer and trial form), and adds the posts to sitemap.xml.
Search engines and AI crawlers can then read each post without running
JavaScript. Run from the repository root:  python3 tools/build_blog.py
"""
import html, json, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://masterartist.co'
API = 'https://fudaosneozobacdalncv.supabase.co/rest/v1/blog_public'
# Public, read-only key (same one the website uses)
ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZGFvc25lb3pvYmFjZGFsbmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4OTIwNDUsImV4cCI6MjEwMjQ2ODA0NX0.0PKbkncE8goPg-iJlAUacNUa3MjWJSj1ZLeqTpkqPZ0'

try:
    import bleach
except ImportError:
    sys.exit('Install bleach first:  pip install bleach')

ALLOWED_TAGS = ['p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'blockquote',
                'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'code', 'pre']
ALLOWED_ATTRS = {'a': ['href', 'title', 'rel', 'target'], 'img': ['src', 'alt', 'width', 'height', 'loading'],
                 'th': ['scope'], 'td': ['colspan', 'rowspan']}


def esc(s):
    return html.escape(str(s or ''), quote=True)


def fetch_posts():
    url = API + '?select=*&order=published_at.desc'
    req = urllib.request.Request(url, headers={'apikey': ANON, 'Authorization': 'Bearer ' + ANON})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:          # blog_public not created yet (supabase/blog.sql not run)
            print('blog_public view not found — no posts to build')
            return []
        raise


def fmt_date(iso):
    if not iso:
        return ''
    y, m, d = iso[:10].split('-')
    months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
    return f'{int(d)} {months[int(m) - 1]} {y}'


def abs_url(u):
    if not u:
        return ''
    return u if re.match(r'^https?://', u) else SITE + '/' + u.lstrip('/')


def card(p):
    cover = (f'<img class="cover" src="{esc(abs_url(p.get("cover_image")))}" alt="{esc(p.get("cover_alt"))}" loading="lazy">'
             if p.get('cover_image') else '<div class="cover ph"><img src="/logo.svg" alt=""></div>')
    tag = f' · {esc(p["tags"][0])}' if p.get('tags') else ''
    return (f'<a class="post-card" href="/blog/{esc(p["slug"])}.html">{cover}<div class="meta">{fmt_date(p.get("published_at"))}{tag}</div>'
            f'<h3>{esc(p["title"])}</h3><p>{esc(p.get("excerpt"))}</p><span class="more">Read article</span></a>')


def build(template, p, others):
    slug, title = p['slug'], p['title']
    url = f'{SITE}/blog/{slug}.html'
    desc = p.get('seo_description') or p.get('excerpt') or ''
    body = bleach.clean(p.get('body_html') or '', tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS,
                        protocols=['http', 'https', 'mailto', 'tel'], strip=True)
    body = re.sub(r'<a (href="https?://(?!masterartist\.co)[^"]*")', r'<a \1 target="_blank" rel="noopener"', body)
    cover = f'<img class="cover" src="{esc(abs_url(p.get("cover_image")))}" alt="{esc(p.get("cover_alt"))}">' if p.get('cover_image') else ''
    meta = ''.join(f'<span>{esc(x)}</span>' for x in [fmt_date(p.get('published_at')), p.get('author') or 'Master Artist', *(p.get('tags') or [])[:3]] if x)
    schema = {
        '@context': 'https://schema.org', '@type': 'BlogPosting', 'headline': title, 'description': desc,
        'datePublished': p.get('published_at'), 'dateModified': p.get('updated_at') or p.get('published_at'),
        'author': {'@type': 'Organization', 'name': p.get('author') or 'Master Artist'},
        'publisher': {'@type': 'Organization', 'name': 'Master Artist', 'logo': {'@type': 'ImageObject', 'url': SITE + '/logo.svg'}},
        'mainEntityOfPage': url, 'keywords': ', '.join(p.get('tags') or [])}
    if p.get('cover_image'):
        schema['image'] = abs_url(p['cover_image'])
    crumbs = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': SITE + '/blog.html'},
        {'@type': 'ListItem', 'position': 3, 'name': title, 'item': url}]}

    doc = template
    doc = re.sub(r'<title>.*?</title>', f'<title>{esc(title)} — Master Artist</title>', doc, 1, re.S)
    doc = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', doc, 1)
    doc = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', doc, 1)
    doc = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(title)}">', doc, 1)
    doc = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', doc, 1)
    doc = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">\n<meta property="og:type" content="article">', doc, 1)
    if p.get('cover_image'):
        doc = re.sub(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{esc(abs_url(p["cover_image"]))}">', doc, 1)
    # drop the template's own breadcrumb schema, add the article's
    doc = re.sub(r'<script type="application/ld\+json">\s*\{\s*"@context": "https://schema.org",\s*"@type": "BreadcrumbList".*?</script>', '', doc, 1, re.S)
    doc = doc.replace('</head>', '<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False) + '</script>\n'
                      '<script type="application/ld+json">' + json.dumps(crumbs, ensure_ascii=False) + '</script>\n</head>', 1)
    # content — ids are renamed so site.js doesn't try to load the post again
    doc = doc.replace('<span id="postCrumb">Article</span>', f'<span>{esc(title)}</span>', 1)
    doc = doc.replace('<h1 id="postTitle">Loading…</h1>', f'<h1>{esc(title)}</h1>', 1)
    doc = doc.replace('<div class="post-meta" id="postMeta"></div>', f'<div class="post-meta">{meta}</div>', 1)
    doc = doc.replace('<article class="article" id="post"></article>', f'<article class="article">{cover}<div class="prose">{body}</div></article>', 1)
    more = ''.join(card(o) for o in others[:3])
    doc = doc.replace('<section id="morePosts" class="alt" hidden>', '<section id="morePosts" class="alt"' + ('' if more else ' hidden') + '>', 1)
    doc = doc.replace('<div class="blog-grid" id="moreGrid"></div>', f'<div class="blog-grid">{more}</div>', 1)
    # the DOMPurify loader is only needed by the dynamic post page
    doc = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/dompurify[^>]*></script>\n?', '', doc)
    return doc


def update_sitemap(posts):
    path = ROOT / 'sitemap.xml'
    xml = path.read_text()
    xml = re.sub(r'\s*<url>\s*<loc>https://masterartist\.co/blog/[^<]+</loc>.*?</url>', '', xml, flags=re.S)
    entries = ''.join(f'\n  <url>\n    <loc>{SITE}/blog/{esc(p["slug"])}.html</loc>\n    <lastmod>{(p.get("updated_at") or p.get("published_at") or "")[:10]}</lastmod>\n'
                      f'    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>' for p in posts)
    xml = xml.replace('\n</urlset>', entries + '\n</urlset>')
    path.write_text(xml)


def main():
    template = (ROOT / 'post.html').read_text()
    posts = [p for p in fetch_posts() if re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', p.get('slug') or '')]
    out_dir = ROOT / 'blog'
    out_dir.mkdir(exist_ok=True)
    keep = set()
    for p in posts:
        f = out_dir / f'{p["slug"]}.html'
        f.write_text(build(template, p, [o for o in posts if o['slug'] != p['slug']]))
        keep.add(f.name)
    for f in out_dir.glob('*.html'):          # unpublished or deleted posts
        if f.name not in keep:
            f.unlink()
    update_sitemap(posts)
    print(f'built {len(posts)} post(s)')


if __name__ == '__main__':
    main()
