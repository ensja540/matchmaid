# -*- coding: utf-8 -*-
"""City landing pages for the New Zealand side.

    python tools/nz_city_page.py

Why these exist. New Zealand had suburb pages (/cleaners/riccarton) and a
national hub (/cleaners), and nothing in between - so nothing on the site
answered "house cleaners Christchurch", which is the phrase far more people
actually type than any suburb name. Australia got city pages on day one; this
is the tier New Zealand was missing.

They sit BETWEEN the hub and the suburbs, and their real job is internal
linking: the hub points at the city, the city points at its suburbs, and each
suburb points back up. That gives the suburb pages a parent to inherit from
instead of fourteen orphans hanging off one national list.

Shape is deliberately the same as the suburb pages - hero, benefits, FAQ, areas,
CTA, same CSS classes. A second layout would have meant new CSS to say exactly
the same thing, and a page that looked like a different site.

The rate ranges are real: what cleaners covering that city currently advertise
on Match Maid, rounded - not a figure from a competitor's blog. Rows below the
$20 floor are excluded, because one legacy listing at $1/hr would otherwise set
the bottom of the published range. Re-run this when the numbers drift:

    select min(r), round(avg(r)), max(r) from (
      select distinct cp.id, (cp.clean_rates->>'regular')::numeric r
        from cleaner_profiles cp
        join cleaner_service_areas csa on csa.cleaner_id = cp.id
        join suburbs s on s.id = csa.suburb_id
       where cp.listing_status = 'active' and s.country = 'NZ'
         and (cp.clean_rates->>'regular')::numeric >= 20) x

Numbers below are as at 8 September 2026.
"""
import io
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import NZ_ORIGIN, nz_url


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = NZ_ORIGIN
CSS = '/styles.css?v=126'
NL = '\n'

NOTICE = ('\U0001F9FD Now open across New Zealand - browse local cleaners, see their rates up '
          'front, and message the one you pick. Free for households and for cleaners while we '
          'grow.')

# slug, city, region, (low, typical, high) NZD hourly for a regular clean,
# hero line, local-knowledge line, and the suburb pages that hang off it.
CITIES = [
    ('auckland', 'Auckland', 'Auckland', (25, 40, 50),
     'City apartments, villas across the isthmus and big family homes out west and south - '
     'Auckland runs on people who do not have a spare four hours.',
     'Traffic is the hidden cost of a cleaner in Auckland. Someone who already works your side of '
     'the bridge, or your end of the motorway, is the one you will still have in a year.',
     [('ponsonby', 'Ponsonby'), ('mount-eden', 'Mount Eden'), ('remuera', 'Remuera'),
      ('takapuna', 'Takapuna'), ('devonport', 'Devonport'), ('henderson', 'Henderson'),
      ('howick', 'Howick'), ('manukau', 'Manukau')]),
    ('christchurch', 'Christchurch', 'Canterbury', (24, 45, 60),
     'Bungalows in the older suburbs, rebuilt homes through the east, and lifestyle blocks on the '
     'edge of town.',
     'Rebuilt homes here have a lot of glass and a lot of floor, which is exactly what shows dust. '
     'A nor-wester puts a fine layer through everything, and that is what makes a regular clean '
     'worth more in Christchurch than a one-off ever is.',
     [('riccarton', 'Riccarton'), ('papanui', 'Papanui'), ('fendalton', 'Fendalton'),
      ('merivale', 'Merivale'), ('halswell', 'Halswell'), ('cashmere', 'Cashmere')]),
]


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


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
        '    <meta property="og:image:width" content="1200" />' + NL +
        '    <meta property="og:image:height" content="630" />' + NL +
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


def chrome_top():
    """The same header the suburb pages carry, so the new tier is invisible to a reader."""
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
        '    </header>' + NL
    )


def chrome_bottom(cta_heading):
    return (
        '      <section class="pitch-cta">' + NL +
        '        <div class="narrow reveal">' + NL +
        '          <p class="eyebrow">Ready when you are</p>' + NL +
        '          <h2>' + esc(cta_heading) + '</h2>' + NL +
        '          <div class="hero-actions" style="justify-content:center; margin-top:2rem">' + NL +
        '            <a class="btn solid lg" href="/browse">Browse cleaners</a>' + NL +
        '            <a class="btn outline lg" href="/for-maids">I am a cleaner</a>' + NL +
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


def faqs(city, rates, suburbs):
    lo, mid, hi = rates
    return [
        ('How much does a house cleaner cost in %s?' % city,
         'Cleaners on Match Maid set and show their own hourly rates up front, so you can compare '
         'before you contact anyone. Rates advertised across %s run from about $%d to $%d an hour '
         'for a regular clean, with most around $%d. A deep clean costs more, because it takes '
         'longer and covers more.' % (city, lo, hi, mid)),
        ('Are Match Maid cleaners in %s vetted?' % city,
         'Cleaners can add ID-verified, criminal-check and insured badges to their profile, so you '
         'can see who has been checked before you let anyone into your home. You always choose who '
         'to contact.'),
        ('Is Match Maid free for households?',
         'Yes - browsing, comparing and contacting cleaners in %s is completely free for '
         'households. You arrange the clean and payment directly with your cleaner, and Match Maid '
         'never takes a commission on the job.' % city),
        ('Which %s suburbs are covered?' % city,
         'All of them. Cleaners set the suburbs they travel to, and the search only shows you '
         'people who cover yours - so a result is someone who will actually come to your address. '
         'We have pages for %s and more.' % (', '.join(n for _s, n in suburbs[:3]))),
        ('How often should I book a cleaner?',
         'Most households on Match Maid book weekly or fortnightly. A regular slot with the same '
         'cleaner works out cheaper per visit than repeated one-offs, because they learn your home '
         'and stop starting from scratch - and it is the arrangement cleaners will hold open for '
         'you.'),
    ]


def city_page(slug, city, region, rates, hero, local, suburbs):
    url = nz_url('/cleaners/%s' % slug)
    title = 'House cleaners in %s | Match Maid' % city
    desc = ('Find a trusted local house cleaner in %s. Browse independent cleaners with rates up '
            'front, read reviews, and contact the one you choose. Free for households.' % city)
    lo, mid, hi = rates
    qa = faqs(city, rates, suburbs)

    ld_service = {
        '@context': 'https://schema.org', '@type': 'Service',
        'serviceType': 'House cleaning',
        'provider': {'@type': 'Organization', 'name': 'Match Maid', 'url': nz_url('/')},
        'areaServed': {
            '@type': 'City', 'name': city,
            'containedInPlace': {
                '@type': 'AdministrativeArea', 'name': region,
                'containedInPlace': {'@type': 'Country', 'name': 'New Zealand'}}},
        # The money a search engine shows has to be the money the customer pays.
        'offers': {'@type': 'AggregateOffer', 'priceCurrency': 'NZD',
                   'lowPrice': lo, 'highPrice': hi, 'unitText': 'HUR'},
        'description': 'Match Maid connects households in %s with independent local house '
                       'cleaners.' % city,
    }
    ld_faq = {'@context': 'https://schema.org', '@type': 'FAQPage',
              'mainEntity': [{'@type': 'Question', 'name': q,
                              'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa]}
    ld_crumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Match Maid', 'item': nz_url('/')},
        {'@type': 'ListItem', 'position': 2, 'name': 'Cleaners by area',
         'item': nz_url('/cleaners')},
        {'@type': 'ListItem', 'position': 3, 'name': city, 'item': url},
    ]}

    faq_html = NL.join(
        '          <div class="faq-item reveal"><h3>%s</h3><p>%s</p></div>' % (esc(q), esc(a))
        for q, a in qa)
    sub_html = NL.join(
        '            <a class="area-link" href="/cleaners/%s">%s</a>' % (s, esc(n))
        for s, n in suburbs)

    body = (
        '    <main>' + NL +
        '      <nav class="crumbs container" aria-label="Breadcrumb">' + NL +
        '        <a href="/">Match Maid</a> <span aria-hidden="true">&rsaquo;</span> '
        '<a href="/cleaners">Cleaners by area</a> <span aria-hidden="true">&rsaquo;</span> '
        '<span aria-current="page">' + esc(city) + '</span>' + NL +
        '      </nav>' + NL +
        '      <section class="pitch-hero container hero-grid">' + NL +
        '        <div class="hero-copy">' + NL +
        '          <p class="eyebrow">' + esc(region) + '</p>' + NL +
        '          <h1>House cleaners<br />in ' + esc(city) + '.</h1>' + NL +
        '          <p class="lede">' + NL +
        '            ' + esc(hero) + ' Browse independent local cleaners who cover ' + esc(city) +
        ', see their transparent hourly rates, and message the one you like. No bidding wars, '
        'no middlemen, and it is free for households.' + NL +
        '          </p>' + NL +
        '          <div class="hero-actions">' + NL +
        '            <a class="btn solid lg" href="/browse">Find a cleaner in ' + esc(city) +
        '</a>' + NL +
        '            <a class="btn outline lg" href="/house-cleaning-prices">What a clean '
        'costs</a>' + NL +
        '          </div>' + NL +
        '          <img class="trust-badges" src="/assets/brand/trust_badges.svg" alt="Cleaners '
        'can be verified, criminal checked and insured" />' + NL +
        '        </div>' + NL +
        '        <div class="hero-art"><img src="/assets/brand/hero_graphic.svg" alt="A Match Maid '
        'cleaner listing with reviews and a message button" /></div>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-tint stagger">' + NL +
        '        <div class="reveal" style="margin-bottom:2.4rem">' + NL +
        '          <p class="eyebrow">Why Match Maid</p>' + NL +
        '          <h2 style="max-width:20ch">Hiring a cleaner in ' + esc(city) +
        ', without the runaround.</h2>' + NL +
        '        </div>' + NL +
        '        <div class="benefit-grid reveal">' + NL +
        '          <div class="benefit"><span class="b-mark">01 &middot; FREE</span><h3>Always '
        'free for you</h3><p>Search, compare and contact ' + esc(city) + ' cleaners at no cost. We '
        'will only ever take a small monthly fee from cleaners, which keeps the service free for '
        'customers.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">02 &middot; TRANSPARENT</span>'
        '<h3>Rates up front</h3><p>Every cleaner rate is shown before you get in touch. We want '
        'full transparency for customers.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">03 &middot; YOUR PICK</span>'
        '<h3>Choose your own cleaner</h3><p>See reviews and verified badges, then pick the person '
        'who is the right fit for your home.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">04 &middot; LOCAL</span><h3>Knows ' +
        esc(city) + '</h3><p>' + esc(local) + '</p></div>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container">' + NL +
        '        <p class="eyebrow reveal">Good to know</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1.4rem">Cleaners in ' + esc(city) +
        ' - your questions</h2>' + NL +
        '        <div class="faq-list">' + NL +
        faq_html + NL +
        '        </div>' + NL +
        '        <p class="reveal" style="margin-top:1.4rem"><a href="/house-cleaning-prices">See '
        'what house cleaning costs across New Zealand</a>, and what actually changes the '
        'price.</p>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-mist secbg-pad">' + NL +
        '        <p class="eyebrow reveal">Areas</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">' + esc(city) +
        ' suburbs we cover</h2>' + NL +
        '        <p class="reveal" style="max-width:60ch">Cleaners set their own travel radius, so '
        'coverage is by suburb rather than by whole city. These are the ' + esc(city) + ' suburbs '
        'with a page of their own - not in one of them? <a href="/browse">Search your own '
        'suburb</a>.</p>' + NL +
        '        <div class="area-links reveal">' + NL +
        sub_html + NL +
        '            <a class="area-link" href="/cleaners">All areas</a>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL +
        # The service pages. A city page catches "cleaners in Christchurch";
        # a fair share of the people it catches actually want one specific job
        # doing, and this is the hand-off to the page about that job.
        '      <section class="section container">' + NL +
        '        <p class="eyebrow reveal">Specific jobs</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">Need a particular clean?</h2>' + NL +
        '        <div class="area-links reveal">' + NL +
        '            <a class="area-link" href="/end-of-tenancy-cleaning">End of tenancy '
        'cleaning</a>' + NL +
        '            <a class="area-link" href="/deep-cleaning">Deep cleaning</a>' + NL +
        '            <a class="area-link" href="/house-cleaning-prices">What a clean costs</a>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL
    )
    return (head(title, desc, url, [ld_service, ld_faq, ld_crumb]) + chrome_top() + body +
            chrome_bottom('Find your %s cleaner.' % city))


def build():
    out_dir = os.path.join(ROOT, 'cleaners')
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for slug, city, region, rates, hero, local, suburbs in CITIES:
        html = city_page(slug, city, region, rates, hero, local, suburbs)
        io.open(os.path.join(out_dir, slug + '.html'), 'w', encoding='utf-8',
                newline='').write(html)
        written.append('cleaners/%s.html' % slug)
    return written


if __name__ == '__main__':
    for w in build():
        print('built', w)
