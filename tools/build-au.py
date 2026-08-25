# -*- coding: utf-8 -*-
"""Build the Australian site under /au from the New Zealand pages.

    python tools/build-au.py

The two sites are the same product in two countries, so the Australian pages
are GENERATED from the New Zealand ones rather than hand-copied. Copying by
hand is how the two drift: a fix to the customer pitch lands on one side, and
six months later nobody can say which version is right.

What this rewrites, and why each one matters:

  * Asset and link paths become absolute. A page at /au/browse resolving
    "styles.css" would ask for /au/styles.css and get a 404.
  * Internal links move to their /au twin, so a visitor who lands on the
    Australian site stays on it.
  * Login links carry country=AU. That is what puts a new account in the
    Australian marketplace rather than the New Zealand one.
  * Canonical and og:url point at the /au URL, and BOTH sides get hreflang
    alternates. Without those, Google sees two near-identical pages and picks
    one - which is how you lose the other.
  * A window.MM_COUNTRY global tells the front-end scripts which marketplace
    they are in, so every API call is country-scoped.

Run it again whenever the New Zealand pages change. The output is committed,
because there is no build step in front of the server.
"""
import io
import os
import re
import json
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import (NZ_ORIGIN, AU_ORIGIN, AU_BASE, AU_ON_OWN_DOMAIN,
                         nz_url, au_url, au_path)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Origins live in site_config so a domain move is one edit, not three.
ORIGIN = NZ_ORIGIN

# The six metros Australia opens in. Blurb is the local-knowledge line on each
# city page - the one thing on it that a template cannot fake.
CITIES = [
    ('sydney', 'Sydney', 'New South Wales', 'NSW',
     'Terrace houses in the inner west, apartments on the north shore and'
     ' harbourside places that show every mark - Sydney cleaners are used to'
     ' working around tight strata access and shared laundries.'),
    ('melbourne', 'Melbourne', 'Victoria', 'VIC',
     'Victorian terraces with ornate cornices, converted warehouses in the'
     ' north and weatherboard homes further out. Melbourne dust settles fast on'
     ' floorboards, which is why fortnightly is the most common booking here.'),
    ('brisbane', 'Brisbane', 'Queensland', 'QLD',
     'Queenslanders on stumps, with VJ walls, wide verandahs and ceiling fans'
     ' that collect more than anyone expects. Humidity means bathrooms and'
     ' window tracks need more attention than they would down south.'),
    ('perth', 'Perth', 'Western Australia', 'WA',
     'Big single-storey homes, limestone and tile, and a coastal wind that puts'
     ' fine sand through everything. Most Perth cleans are larger floor areas'
     ' than the eastern states, so hourly rates go further per room.'),
    ('hobart', 'Hobart', 'Tasmania', 'TAS',
     'Sandstone cottages in Battery Point, weatherboard in the northern'
     ' suburbs, and cold damp winters that make mould in bathrooms and window'
     ' frames the thing worth staying on top of.'),
    ('darwin', 'Darwin', 'Northern Territory', 'NT',
     'Elevated tropical homes, louvres and open-plan living built for the heat.'
     ' Wet-season humidity and red dust mean regular cleans matter more here'
     ' than almost anywhere else in the country.'),
]

# Content substitutions, longest first so "New Zealand" is never half-matched by
# a later "Zealand" rule. Order within this list is significant.
CONTENT = [
    # First, because the broad "across New Zealand" rule below would otherwise
    # eat its prefix and leave "Now open across Australia" - which is a lie:
    # six metros is not a country.
    ('Now open across New Zealand - browse local cleaners',
     'Now open in Sydney, Melbourne, Brisbane, Perth, Hobart and Darwin - browse local cleaners'),
    ("New Zealand's biggest network of cleaners", "Australia's biggest network of cleaners"),
    ("New Zealand's biggest network", "Australia's biggest network"),
    ('NZ&apos;s', "Australia's"),
    ('across New Zealand', 'across Australia'),
    ('in New Zealand', 'in Australia'),
    ('New Zealand', 'Australia'),
    ('Christchurch and Auckland', 'Sydney, Melbourne, Brisbane, Perth, Hobart and Darwin'),
    ('Christchurch or Auckland', 'Sydney, Melbourne, Brisbane, Perth, Hobart or Darwin'),
    ('Christchurch, NZ', 'Australia'),
    ('across Christchurch', 'across Australia'),
    ('Christchurch', 'Sydney'),
    ('Auckland', 'Melbourne'),
    ("NZ's", "Australia's"),
    ('in NZ', 'in Australia'),
    ('of NZ', 'of Australia'),
    ('NZ', 'Australia'),
]

# Absolute-path rewrites. Applied to href/src attributes only.
LINK_MAP = {
    '/': '/au',
    '/browse': '/au/browse',
    '/for-customers': '/au/for-customers',
    '/for-maids': '/au/for-maids',
    '/cleaners': '/au/cleaners',
}


def absolutise(html):
    """Make every relative asset reference root-relative.

    /au/browse.html sits one directory deeper than browse.html, so a bare
    "styles.css" would resolve to /au/styles.css and 404. Only touches
    references that are already relative - anything starting with /, http or #
    is left exactly as it is.
    """
    def fix(m):
        attr, quote, url = m.group(1), m.group(2), m.group(3)
        if url.startswith(('/', 'http://', 'https://', '#', 'data:', 'mailto:', 'tel:')):
            return m.group(0)
        return f'{attr}={quote}/{url}{quote}'
    return re.sub(r'\b(href|src)=(["\'])([^"\']+)\2', fix, html)


def relink(html):
    """Point internal links at their /au twin, and tag login links with AU."""
    def fix(m):
        attr, quote, url = m.group(1), m.group(2), m.group(3)
        if url.startswith('/login'):
            joiner = '&' if '?' in url else '?'
            if 'country=' not in url:
                url = f'{url}{joiner}country=AU'
            return f'{attr}={quote}{url}{quote}'
        # Longest match first: /cleaners/ponsonby must not become /au/cleaners.
        for src in sorted(LINK_MAP, key=len, reverse=True):
            if url == src or (src != '/' and url.startswith(src + '/')) or \
               (src != '/' and url.startswith(src + '?')):
                return f'{attr}={quote}{LINK_MAP[src] + url[len(src):]}{quote}'
        if url == '/':
            return f'{attr}={quote}/au{quote}'
        return m.group(0)
    return re.sub(r'\b(href|src)=(["\'])([^"\']+)\2', fix, html)


# Machine-readable values that happen to contain "NZ" but are not prose. These
# are pulled out before the content swap and put back after it, or the
# "NZ" -> "Australia" rule turns lang="en-NZ" into lang="en-Australia".
PROTECT = ['en-NZ', 'matchmaid.co.nz', 'hreflang="x-default"']


def swap_content(html):
    holds = {}
    for i, token in enumerate(PROTECT):
        key = 'PROTECT%d' % i  # private-use chars: cannot occur in page text
        holds[key] = token
        html = html.replace(token, key)
    for a, b in CONTENT:
        html = html.replace(a, b)
    for key, token in holds.items():
        html = html.replace(key, token)
    return html


def canonicalise(html, nz_path, au_path):
    """Point canonical/og:url at the /au URL and add the hreflang pair."""
    html = html.replace(f'{ORIGIN}{nz_path}"', f'{ORIGIN}{au_path}"')
    html = html.replace('<html lang="en-NZ">', '<html lang="en-AU">')
    return add_hreflang(html, nz_path, au_path)


def add_hreflang(html, nz_path, au_path):
    """Both sides of a pair must list BOTH alternates, and agree.

    Google ignores hreflang that is not reciprocal, so the New Zealand page has
    to point at the Australian one and vice versa. x-default goes to New
    Zealand: it is the older site and the one a visitor from anywhere else
    should land on.
    """
    tags = (
        f'\n    <link rel="alternate" hreflang="en-NZ" href="{ORIGIN}{nz_path}" />'
        f'\n    <link rel="alternate" hreflang="en-AU" href="{ORIGIN}{au_path}" />'
        f'\n    <link rel="alternate" hreflang="x-default" href="{ORIGIN}{nz_path}" />'
    )
    html = re.sub(r'\n\s*<link rel="alternate" hreflang="[^"]*"[^>]*/>', '', html)
    return html.replace('<link rel="canonical"', tags.strip() + '\n    <link rel="canonical"', 1)


# The Australian town -> suburbs map must be in place BEFORE demo.js runs:
# demo.js swaps it in at load time, and browse.js builds the location dropdown
# from it immediately afterwards.
TOWNS_SCRIPT = '<script src="/au/towns-au.js?v=1"></script>' + chr(10) + '    '

COUNTRY_SCRIPT = (
    '<script>window.MM_COUNTRY = "AU";</script>\n    '
)


def build_page(nz_file, au_file, nz_path, au_path):
    src = io.open(os.path.join(ROOT, nz_file), encoding='utf-8').read()
    out = absolutise(src)
    out = relink(out)
    out = swap_content(out)
    out = canonicalise(out, nz_path, au_path)
    # Ahead of every other script, so the country is set before anything reads it.
    out = out.replace('<script src="/analytics.js', COUNTRY_SCRIPT + '<script src="/analytics.js', 1)
    # The Australian town -> suburbs map has to be in place BEFORE demo.js runs,
    # because demo.js swaps it in at load time and browse.js builds the location
    # dropdown from it immediately after.
    out = out.replace('<script src="/demo.js', TOWNS_SCRIPT + '<script src="/demo.js', 1)
    dest = os.path.join(ROOT, au_file)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    io.open(dest, 'w', encoding='utf-8', newline='').write(out)

    # The New Zealand original needs the same reciprocal pair.
    nz_out = add_hreflang(src, nz_path, au_path)
    if nz_out != src:
        io.open(os.path.join(ROOT, nz_file), 'w', encoding='utf-8', newline='').write(nz_out)
    return au_file


PAGES = [
    ('index.html',           'au/index.html',           '/',              '/au'),
    ('for-customers.html',   'au/for-customers.html',   '/for-customers', '/au/for-customers'),
    ('for-maids.html',       'au/for-maids.html',       '/for-maids',     '/au/for-maids'),
    ('browse.html',          'au/browse.html',          '/browse',        '/au/browse'),
]

if __name__ == '__main__':
    built = [build_page(*p) for p in PAGES]
    for b in built:
        print('built', b)
