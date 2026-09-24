# -*- coding: utf-8 -*-
"""Regenerate sitemap.xml across both countries.

    python tools/build-sitemap.py

Every entry carries its hreflang alternates inline. Google reads the pairing
from the sitemap as well as from the pages, and having it in both places is
what stops the two near-identical sites being collapsed into one - which would
mean losing whichever one Google decided was the duplicate.

Australia-only pages (the six city pages and their hub) have no New Zealand
twin, so they get no alternates: claiming one that does not exist is worse
than claiming none.
"""
import io
import os
import datetime
import subprocess
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import (NZ_ORIGIN, AU_ORIGIN, AU_BASE, AU_ON_OWN_DOMAIN,
                         nz_url, au_url, au_path)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files with uncommitted changes, so a page edited but not yet committed is
# dated from its mtime rather than from the commit that last touched it.
def _dirty():
    try:
        out = subprocess.run(['git', 'status', '--porcelain', '--untracked-files=all'],
                             cwd=ROOT, capture_output=True, text=True, timeout=15)
        return {ln[3:].strip().strip('"') for ln in out.stdout.splitlines() if len(ln) > 3}
    except Exception:
        return set()


DIRTY = _dirty()


def source_file(path, au=False):
    """The file behind a URL. '/cleaners' is a directory index; the rest map 1:1."""
    base = 'au/' if au else ''
    if path == '/':
        return base + 'index.html'
    if path == '/cleaners':
        return base + 'cleaners/index.html'
    return base + path.lstrip('/') + '.html'


def last_changed(rel):
    """The date the page actually last changed.

    This used to be TODAY for all 37 URLs on every run, which told Google that
    /terms changes as often as the home page does. lastmod that is provably
    wrong is lastmod Google stops reading, and it is the one field in a sitemap
    it still pays attention to.

    Git commit date, because that is when the page really changed - falling back
    to mtime for anything uncommitted or not in git yet.
    """
    full = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(full):
        return TODAY
    if rel not in DIRTY:
        try:
            out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', rel],
                                 cwd=ROOT, capture_output=True, text=True, timeout=15)
            if out.stdout.strip():
                return out.stdout.strip()
        except Exception:
            pass
    return datetime.date.fromtimestamp(os.path.getmtime(full)).isoformat()
# Origins live in site_config so a domain move is one edit, not three.
ORIGIN = NZ_ORIGIN
TODAY = datetime.date.today().isoformat()

# Pages that exist in both countries: (path, changefreq, priority). The path is
# the same on both sides; au_url() puts it under whatever prefix or domain
# Australia currently lives at.
PAIRED = [
    ('/',              'weekly', '1.0'),
    ('/for-customers', 'weekly', '0.9'),
    ('/for-maids',     'weekly', '0.9'),
    ('/browse',        'daily',  '0.9'),
]

# New Zealand only: the hub, the city tier under it, the suburb pages under
# that, and the price guide. Priority follows the tier - a city page answers the
# phrase far more people search than any suburb name, so it outranks its own
# children here.
NZ_ONLY = [
    ('/cleaners', 'monthly', '0.7'),
    ('/cleaners/auckland', 'weekly', '0.8'),
    ('/cleaners/christchurch', 'weekly', '0.8'),
    ('/house-cleaning-prices', 'monthly', '0.8'),
    ('/end-of-tenancy-cleaning', 'monthly', '0.8'),
    ('/deep-cleaning', 'monthly', '0.8'),
    # A tool rather than an article, so it earns its own entry: "how much does
    # a cleaner cost" is a question people type expecting a number back.
    ('/cleaning-cost-calculator', 'monthly', '0.8'),
] + [
    ('/cleaners/' + s, 'monthly', '0.7') for s in [
        'riccarton', 'papanui', 'merivale', 'fendalton', 'cashmere', 'halswell',
        'ponsonby', 'mount-eden', 'remuera', 'takapuna', 'devonport',
        'henderson', 'howick', 'manukau',
        # The second wave of Christchurch suburbs, plus Point Chevalier in
        # Auckland. A page that exists but is in no sitemap is a page nobody
        # asked to be written.
        'addington', 'barrington', 'beckenham', 'opawa', 'somerfield',
        'spreydon', 'st-martins', 'sydenham', 'point-chevalier',
    ]
]

# Australia only: the six metros and their hub.
AU_ONLY = ['/cleaners'] + [
    '/cleaners/' + s
    for s in ['sydney', 'melbourne', 'brisbane', 'perth', 'hobart', 'darwin']
]

# Shared, single-copy pages. Listed once, under no country.
SHARED = [('/terms', 'yearly', '0.3'), ('/privacy', 'yearly', '0.3')]


def entry(loc, changefreq, priority, lastmod, alternates=None):
    # loc and the alternates are already absolute: which origin they carry is
    # site_config's business, not this function's.
    out = ['  <url>', '    <loc>%s</loc>' % loc]
    for hreflang, href in (alternates or []):
        out.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s" />'
                   % (hreflang, href))
    out += ['    <lastmod>%s</lastmod>' % lastmod,
            '    <changefreq>%s</changefreq>' % changefreq,
            '    <priority>%s</priority>' % priority,
            '  </url>']
    return '\n'.join(out)


def build():
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
             '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']

    for path, freq, pri in PAIRED:
        nz, au = nz_url(path), au_url(path)
        alts = [('en-NZ', nz), ('en-AU', au), ('x-default', nz)]
        # Each side is dated from its own file: the Australian copy is
        # regenerated whenever the New Zealand one changes, but not only then.
        parts.append(entry(nz, freq, pri, last_changed(source_file(path)), alts))
        parts.append(entry(au, freq, pri, last_changed(source_file(path, au=True)), alts))

    for path, freq, pri in NZ_ONLY:
        parts.append(entry(nz_url(path), freq, pri, last_changed(source_file(path))))
    for path in AU_ONLY:
        parts.append(entry(au_url(path), 'monthly', '0.7',
                           last_changed(source_file(path, au=True))))
    # Terms and privacy are one shared copy on the New Zealand domain. Once
    # Australia has its own, they will need either a copy there or a cross-domain
    # link - a canonical pointing off-domain is fine, a bare 404 is not.
    for path, freq, pri in SHARED:
        parts.append(entry(nz_url(path), freq, pri, last_changed(source_file(path))))

    parts.append('</urlset>')
    xml = '\n'.join(parts) + '\n'
    io.open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='').write(xml)
    return xml.count('<loc>')


if __name__ == '__main__':
    print('sitemap.xml:', build(), 'URLs')
