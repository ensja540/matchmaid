# -*- coding: utf-8 -*-
"""Suburb landing pages for New Zealand, gated on real coverage.

    python tools/nz_suburb_page.py            # report + generate
    python tools/nz_suburb_page.py --report   # report only, write nothing

WHY THIS IS GATED TWICE.

There are 1,688 New Zealand suburbs and a generator could emit a page for every
one of them tonight. That is exactly the thing not to do. Google's definition of
a doorway page is "pages generated for many locations that funnel users to the
same destination", and 1,688 pages differing only in a place name, all pointing
at one search box, is that definition with the serial numbers filed off. The
penalty lands on the whole domain, not on the bad pages.

So a suburb gets a page only if it clears BOTH gates:

  1. COVERAGE. At least MIN_CLEANERS active cleaners actually travel to it.
     Below that the page promises a search that comes back thin or empty, which
     is worse than not ranking at all. This gate is automatic - it reads the
     database, so it tightens on its own when a cleaner pauses their listing.

  2. SOMETHING TO SAY. A hand-written line about the suburb, in BLURBS below.
     No line, no page. This is the gate that actually stops the doorway
     pattern, and it is deliberately manual: it puts a human between "this
     suburb is eligible" and "this suburb is worth a page". Two minutes of
     writing per page is the cost of not being a content farm.

Each page also carries real per-suburb numbers - how many cleaners cover it and
what they charge there - so that two pages are never the same page with the
name swapped. Those numbers are baked in at build time, so re-run this when
supply moves.

WHAT THIS DOES NOT TOUCH. The fourteen original suburb pages (Riccarton,
Ponsonby and friends) are hand-maintained and are NOT in BLURBS. The generator
skips any suburb it does not own, so it can never overwrite hand-written copy.

SCALING PAST A COUPLE OF DOZEN. Do not, until /browse is server-rendered. What
makes a suburb page non-generic on a real marketplace is the listings on it -
actual cleaners, actual rates, actual reviews. Until those render server-side
there is nothing on the page a crawler can see that the template did not
supply, and volume becomes the risk rather than the reward.
"""
import io
import json
import os
import re
import subprocess
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import NZ_ORIGIN, nz_url


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = NZ_ORIGIN
CSS = '/styles.css?v=125'
NL = '\n'

# Below this, the search behind the page is too thin to be worth ranking for.
MIN_CLEANERS = 4

NOTICE = ('\U0001F9FD Now open across New Zealand - browse local cleaners, see their rates up '
          'front, and message the one you pick. Free for households and for cleaners while we '
          'grow.')

# The fourteen originals. Hand-written, hand-maintained, never generated here -
# listed so the coverage report does not keep suggesting them.
HAND_WRITTEN = {
    'riccarton', 'papanui', 'merivale', 'fendalton', 'cashmere', 'halswell',
    'ponsonby', 'mount-eden', 'remuera', 'takapuna', 'devonport', 'henderson',
    'howick', 'manukau',
}

# suburb name in the database -> (slug, city slug, city, region, the line).
# The line is the whole point: it is the one thing on the page a template could
# not have produced. Write it about the housing, not about cleaning.
BLURBS = {
    'Addington': ('addington', 'christchurch', 'Christchurch', 'Canterbury',
                  'Villas and workers cottages packed in tight, with new townhouses filling every '
                  'spare section between them. A lot of Addington homes are rentals or recent '
                  'builds, which means small footprints and a lot of hard flooring.'),
    'Sydenham': ('sydenham', 'christchurch', 'Christchurch', 'Canterbury',
                 'Cottages on small sections, converted warehouses and a steady run of new '
                 'townhouses. Sydenham sits right on the edge of the central city, so a cleaner '
                 'working here is rarely travelling far between jobs.'),
    'Spreydon': ('spreydon', 'christchurch', 'Christchurch', 'Canterbury',
                 'Post-war family homes on full sections, with plenty of three and four bedroom '
                 'houses. Bigger floor areas than the inner-city suburbs, which shows up in the '
                 'hours a clean takes rather than in the hourly rate.'),
    'Beckenham': ('beckenham', 'christchurch', 'Christchurch', 'Canterbury',
                  'Bungalows from the 1920s and 30s on leafy streets near the Heathcote. Older '
                  'homes mean wooden floors, picture rails and the kind of detail that takes a '
                  'careful clean rather than a fast one.'),
    'St Martins': ('st-martins', 'christchurch', 'Christchurch', 'Canterbury',
                   'Quiet streets of bungalows between the river and the Port Hills, a lot of '
                   'them family homes that have been in the same hands a long time. Gardens back '
                   'onto the Heathcote, so tracked-in dirt is a fact of life here.'),
    'Somerfield': ('somerfield', 'christchurch', 'Christchurch', 'Canterbury',
                   'Modest post-war homes on tidy sections, with a mix of long-term owners and '
                   'young families. Compact houses, so a regular clean here is usually a shorter '
                   'visit than the Christchurch average.'),
    'Opawa': ('opawa', 'christchurch', 'Christchurch', 'Canterbury',
              'Older villas and bungalows on the river side of the Port Hills, some of them '
              'substantial. High ceilings and original timber are common, and both take longer '
              'to do properly than a modern build.'),
    'Barrington': ('barrington', 'christchurch', 'Christchurch', 'Canterbury',
                   'Family homes on full sections around the Barrington shops, a settled part of '
                   'the city where a lot of households book the same cleaner fortnightly for '
                   'years.'),
    'Point Chevalier': ('point-chevalier', 'auckland', 'Auckland', 'Auckland',
                        'Bungalows and villas on a peninsula with water at both ends, plus a '
                        'steady run of renovations. Salt air marks windows faster here than it '
                        'does inland, and the older houses have the floors to match.'),
}


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def coverage():
    """How many active cleaners cover each suburb, and what they charge there.

    Shells out to node rather than adding a Python database driver: db.js
    already holds the connection string and the pooling, and one source of
    truth for "how do we reach the database" is worth an odd-looking subprocess.
    """
    script = r"""
    import('file:///C:/Matchmaid/server/db.js').then(async ({query, pool}) => {
      const { rows } = await query(`
        select s.name,
               count(distinct cp.id)::int cleaners,
               min((cp.clean_rates->>'regular')::numeric)
                 filter (where (cp.clean_rates->>'regular')::numeric >= 20) lo,
               max((cp.clean_rates->>'regular')::numeric)
                 filter (where (cp.clean_rates->>'regular')::numeric >= 20) hi
          from cleaner_profiles cp
          join cleaner_service_areas csa on csa.cleaner_id = cp.id
          join suburbs s on s.id = csa.suburb_id
         where cp.listing_status = 'active' and s.country = 'NZ'
         group by s.name`);
      console.log('@@' + JSON.stringify(rows));
      await pool.end();
    });
    """
    out = subprocess.run(['node', '-e', script], cwd=os.path.join(ROOT, 'server'),
                         capture_output=True, text=True, timeout=120)
    line = next((l for l in out.stdout.splitlines() if l.startswith('@@')), None)
    if not line:
        raise SystemExit('could not read coverage from the database:\n' + (out.stderr or out.stdout))
    return {r['name']: r for r in json.loads(line[2:])}


def head(title, desc, url, ld_blocks):
    lds = NL.join(
        '    <script type="application/ld+json">%s</script>'
        % json.dumps(b, separators=(',', ':')) for b in ld_blocks)
    return (
        '<!DOCTYPE html>' + NL +
        '<html lang="en-NZ">' + NL +
        '  <head>' + NL +
        '    <meta charset="UTF-8" />' + NL +
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />' + NL +
        '    <script src="/analytics.js?v=87"></script>' + NL +
        '    <script src="/attribution.js?v=2"></script>' + NL +
        '    <title>' + esc(title) + '</title>' + NL +
        '    <link rel="icon" href="/favicon.ico" sizes="any" />' + NL +
        '    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />' + NL +
        '    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />' + NL +
        '    <link rel="manifest" href="/site.webmanifest" />' + NL +
        '    <meta name="theme-color" content="#14B8A6" />' + NL +
        '    <meta name="description" content="' + esc(desc) + '" />' + NL +
        '    <link rel="canonical" href="' + url + '" />' + NL +
        '    <meta property="og:type" content="website" />' + NL +
        '    <meta property="og:site_name" content="Match Maid" />' + NL +
        '    <meta property="og:title" content="' + esc(title) + '" />' + NL +
        '    <meta property="og:description" content="' + esc(desc) + '" />' + NL +
        '    <meta property="og:url" content="' + url + '" />' + NL +
        '    <meta property="og:locale" content="en_NZ" />' + NL +
        '    <meta property="og:image" content="' + ORIGIN + '/og-image.png" />' + NL +
        '    <meta name="twitter:card" content="summary_large_image" />' + NL +
        '    <meta name="twitter:image" content="' + ORIGIN + '/og-image.png" />' + NL +
        '    <link rel="preconnect" href="https://fonts.googleapis.com" />' + NL +
        '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' + NL +
        '    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+'
        'Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Manrope:wght@300;400;'
        '500;600;700;800&display=swap" />' + NL +
        '    <link rel="stylesheet" href="' + CSS + '" />' + NL +
        lds + NL +
        '  </head>' + NL
    )


def chrome(city_slug, city, name, body, cta):
    return (
        '  <body class="pitch-body role-customer">' + NL +
        '    <div class="notice-bar">' + NL +
        '      ' + NOTICE + NL +
        '    </div>' + NL +
        '    <header class="pitch-top">' + NL +
        '      <a class="brand" href="/"><img class="brand-mark" src="/assets/logo-mark.svg" '
        'alt="Match Maid" /></a>' + NL +
        '      <div class="pitch-top-right">' + NL +
        '        <a class="ulink cross-link" href="/for-maids">Are you a cleaner?</a>' + NL +
        '        <a class="ulink" href="/for-customers">Why Match Maid</a>' + NL +
        '        <a class="btn sm" href="/login?role=customer">Log in</a>' + NL +
        '        <a class="btn sm solid create" href="/browse">Browse cleaners</a>' + NL +
        '      </div>' + NL +
        '    </header>' + NL + NL +
        '    <main>' + NL +
        '      <nav class="crumbs container" aria-label="Breadcrumb">' + NL +
        '        <a href="/">Match Maid</a> <span aria-hidden="true">&rsaquo;</span> '
        '<a href="/cleaners">Cleaners by area</a> <span aria-hidden="true">&rsaquo;</span> '
        '<a href="/cleaners/' + city_slug + '">' + esc(city) + '</a> '
        '<span aria-hidden="true">&rsaquo;</span> '
        '<span aria-current="page">' + esc(name) + '</span>' + NL +
        '      </nav>' + NL +
        body +
        '      <section class="pitch-cta">' + NL +
        '        <div class="narrow reveal">' + NL +
        '          <p class="eyebrow">Ready when you are</p>' + NL +
        '          <h2>' + esc(cta) + '</h2>' + NL +
        '          <div class="hero-actions" style="justify-content:center; margin-top:2rem">' + NL +
        '            <a class="btn solid lg" href="/browse?suburb=' + esc(name) +
        '">Browse cleaners</a>' + NL +
        '            <a class="btn outline lg" href="/cleaning-cost-calculator">Work out the '
        'cost</a>' + NL +
        '          </div>' + NL +
        '        </div>' + NL +
        '      </section>' + NL +
        '    </main>' + NL + NL +
        '    <footer class="splash-footer accent">' + NL +
        '      <div class="sf-inner">' + NL +
        '        <span class="sf-brand">Match Maid</span>' + NL +
        '        <span class="sf-mid">Free for households &middot; Rates up front &middot; You '
        'choose who</span>' + NL +
        '        <span class="sf-copy">&copy; <span id="sf-year"></span> &middot; Christchurch, NZ '
        '&middot; <a href="/terms">Terms</a> &middot; <a href="/privacy">Privacy</a></span>' + NL +
        '      </div>' + NL +
        '      <p class="footer-disclaimer">Match Maid is a directory service only. We do not '
        'accept liability for cleaning issues or disputes. Please do thorough due diligence and '
        'pay for services directly to the cleaner upon job completion.</p>' + NL +
        '    </footer>' + NL + NL +
        '    <script src="/session.js?v=89"></script>' + NL +
        '    <script src="/social.js?v=1"></script>' + NL +
        '    <script src="/reveal.js?v=87"></script>' + NL +
        '    <script>document.getElementById("sf-year").textContent = new Date().getFullYear();'
        '</script>' + NL +
        '    <script src="/feedback.js?v=64"></script>' + NL +
        '    <script src="/geo-banner.js?v=1"></script>' + NL +
        '  </body>' + NL +
        '</html>' + NL
    )


def suburb_page(name, meta, cov, siblings):
    slug, city_slug, city, region, blurb = meta
    url = nz_url('/cleaners/%s' % slug)
    n = cov['cleaners']
    lo, hi = int(float(cov['lo'])), int(float(cov['hi']))
    title = 'House cleaners in %s, %s | Match Maid' % (name, city)
    desc = ('Find a house cleaner in %s. %d independent local cleaners cover the suburb, charging '
            '$%d to $%d an hour, with rates shown before you make contact. Free for households.'
            % (name, n, lo, hi))

    ld = [
        {'@context': 'https://schema.org', '@type': 'Service',
         'serviceType': 'House cleaning',
         'provider': {'@type': 'Organization', 'name': 'Match Maid', 'url': nz_url('/')},
         'areaServed': {'@type': 'Place', 'name': '%s, %s, New Zealand' % (name, city)},
         'offers': {'@type': 'AggregateOffer', 'priceCurrency': 'NZD', 'lowPrice': lo,
                    'highPrice': hi, 'unitText': 'HUR', 'offerCount': n},
         'description': 'Match Maid connects households in %s with independent local house '
                        'cleaners.' % name},
        {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Match Maid', 'item': nz_url('/')},
            {'@type': 'ListItem', 'position': 2, 'name': 'Cleaners by area',
             'item': nz_url('/cleaners')},
            {'@type': 'ListItem', 'position': 3, 'name': city,
             'item': nz_url('/cleaners/%s' % city_slug)},
            {'@type': 'ListItem', 'position': 4, 'name': name, 'item': url},
        ]},
    ]

    sib_html = NL.join(
        '            <a class="area-link" href="/cleaners/%s">%s</a>' % (s, esc(nm))
        for nm, s in siblings)

    body = (
        '      <section class="pitch-hero container hero-grid">' + NL +
        '        <div class="hero-copy">' + NL +
        '          <p class="eyebrow">' + esc(city) + ' &middot; ' + esc(name) + '</p>' + NL +
        '          <h1>House cleaners<br />in ' + esc(name) + '.</h1>' + NL +
        '          <p class="lede">' + NL +
        '            ' + esc(blurb) + ' Browse the cleaners who cover ' + esc(name) + ', see what '
        'they charge before you get in touch, and message the one you pick. Free for '
        'households.' + NL +
        '          </p>' + NL +
        '          <div class="hero-actions">' + NL +
        '            <a class="btn solid lg" href="/browse?suburb=' + esc(name) +
        '">Find a cleaner in ' + esc(name) + '</a>' + NL +
        '            <a class="btn outline lg" href="/cleaning-cost-calculator">What will it '
        'cost?</a>' + NL +
        '          </div>' + NL +
        '          <img class="trust-badges" src="/assets/brand/trust_badges.svg" alt="Cleaners '
        'can be verified, criminal checked and insured" />' + NL +
        '        </div>' + NL +
        '        <div class="hero-art"><img src="/assets/brand/hero_graphic.svg" alt="A Match Maid '
        'cleaner listing with reviews and a message button" /></div>' + NL +
        '      </section>' + NL + NL +
        # The numbers are the reason this page is not the page next door with a
        # different name on it.
        '      <section class="section container">' + NL +
        '        <div class="benefit-grid reveal">' + NL +
        '          <div class="benefit"><span class="b-mark">COVERAGE</span><h3>' + str(n) +
        ' cleaners</h3><p>Independent cleaners who list ' + esc(name) + ' as a suburb they travel '
        'to, so a result here is someone who will actually come to your address.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">RATES</span><h3>$' + str(lo) +
        ' - $' + str(hi) + ' / hr</h3><p>What those cleaners advertise for a regular clean. Every '
        'rate is on the profile before you make contact. <a href="/house-cleaning-prices">How '
        'that compares</a>.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">YOUR COST</span><h3>$0</h3><p>No '
        'booking fee, no commission, no markup. You pay the cleaner their advertised rate, '
        'directly. <a href="/cleaning-cost-calculator">Estimate your clean</a>.</p></div>' + NL +
        '        </div>' + NL +
        '        <p class="reveal" style="max-width:64ch; margin-top:1.6rem; color:var(--muted); '
        'font-size:0.9rem">Coverage and rates as at September 2026. Cleaners set their own travel '
        'radius and their own prices, so both move as people join and update their '
        'listings.</p>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-mist secbg-pad">' + NL +
        '        <p class="eyebrow reveal">Nearby</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">Other ' + esc(city) +
        ' areas</h2>' + NL +
        '        <p class="reveal" style="max-width:60ch">Not in ' + esc(name) + '? '
        '<a href="/browse">Search your own suburb</a>, or start from '
        '<a href="/cleaners/' + city_slug + '">all ' + esc(city) + ' cleaners</a>.</p>' + NL +
        '        <div class="area-links reveal">' + NL +
        sib_html + NL +
        '            <a class="area-link" href="/cleaners/' + city_slug + '">All ' + esc(city) +
        '</a>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL
    )
    return (head(title, desc, url, ld) +
            chrome(city_slug, city, name, body, 'Find your %s cleaner.' % name))


def build(report_only=False):
    cov = coverage()
    eligible = {n: c for n, c in cov.items() if c['cleaners'] >= MIN_CLEANERS and c['lo']}

    ready = {n: m for n, m in BLURBS.items() if n in eligible}
    no_blurb = sorted(n for n in eligible
                      if n not in BLURBS and re.sub(r'[^a-z]+', '-', n.lower()) not in HAND_WRITTEN)
    thin = sorted(n for n in BLURBS if n not in eligible)

    print('coverage floor: %d active cleaners' % MIN_CLEANERS)
    print('  eligible suburbs:          %d' % len(eligible))
    print('  ...with a blurb (built):   %d' % len(ready))
    print('  ...awaiting a blurb:       %d' % len(no_blurb))
    if thin:
        print('  BELOW THE FLOOR, still published: %s' % ', '.join(thin))
        print('    ^ coverage fell away. Remove these pages or recruit in those suburbs.')
    if no_blurb:
        print('\n  Eligible, no page yet (write a line in BLURBS to publish one):')
        for n in no_blurb[:25]:
            print('    %-22s %d cleaners' % (n, eligible[n]['cleaners']))
        if len(no_blurb) > 25:
            print('    ... and %d more' % (len(no_blurb) - 25))
        print('\n  Do NOT bulk-write these. See the module docstring: past a couple of dozen,')
        print('  suburb pages need server-rendered listings or they read as doorway pages.')

    if report_only:
        return []

    written = []
    for name, meta in sorted(ready.items()):
        slug, city_slug, city, region, _ = meta
        siblings = [(n, m[0]) for n, m in sorted(ready.items())
                    if m[1] == city_slug and n != name][:5]
        html = suburb_page(name, meta, eligible[name], siblings)
        io.open(os.path.join(ROOT, 'cleaners', slug + '.html'), 'w', encoding='utf-8',
                newline='').write(html)
        written.append('cleaners/%s.html' % slug)
    return written


if __name__ == '__main__':
    for w in build(report_only='--report' in sys.argv):
        print('built', w)
