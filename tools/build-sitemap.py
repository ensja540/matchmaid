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
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import (NZ_ORIGIN, AU_ORIGIN, AU_BASE, AU_ON_OWN_DOMAIN,
                         nz_url, au_url, au_path)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

# New Zealand only: the suburb pages and their hub.
NZ_ONLY = ['/cleaners'] + [
    '/cleaners/' + s for s in [
        'riccarton', 'papanui', 'merivale', 'fendalton', 'cashmere', 'halswell',
        'ponsonby', 'mount-eden', 'remuera', 'takapuna', 'devonport',
        'henderson', 'howick', 'manukau',
    ]
]

# Australia only: the six metros and their hub.
AU_ONLY = ['/cleaners'] + [
    '/cleaners/' + s
    for s in ['sydney', 'melbourne', 'brisbane', 'perth', 'hobart', 'darwin']
]

# Shared, single-copy pages. Listed once, under no country.
SHARED = [('/terms', 'yearly', '0.3'), ('/privacy', 'yearly', '0.3')]


def entry(loc, changefreq, priority, alternates=None):
    # loc and the alternates are already absolute: which origin they carry is
    # site_config's business, not this function's.
    out = ['  <url>', '    <loc>%s</loc>' % loc]
    for hreflang, href in (alternates or []):
        out.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s" />'
                   % (hreflang, href))
    out += ['    <lastmod>%s</lastmod>' % TODAY,
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
        parts.append(entry(nz, freq, pri, alts))
        parts.append(entry(au, freq, pri, alts))

    for path in NZ_ONLY:
        parts.append(entry(nz_url(path), 'monthly', '0.7'))
    for path in AU_ONLY:
        parts.append(entry(au_url(path), 'monthly', '0.7'))
    # Terms and privacy are one shared copy on the New Zealand domain. Once
    # Australia has its own, they will need either a copy there or a cross-domain
    # link - a canonical pointing off-domain is fine, a bare 404 is not.
    for path, freq, pri in SHARED:
        parts.append(entry(nz_url(path), freq, pri))

    parts.append('</urlset>')
    xml = '\n'.join(parts) + '\n'
    io.open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='').write(xml)
    return xml.count('<loc>')


if __name__ == '__main__':
    print('sitemap.xml:', build(), 'URLs')
