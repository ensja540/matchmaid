# -*- coding: utf-8 -*-
"""City landing pages for the Australian side, and the hub that lists them.

One page per metro Match Maid is open in. These mirror the New Zealand suburb
pages in shape - hero, benefits, FAQ, nearby, CTA - because that shape is what
the New Zealand pages were built and tuned as, and there is no reason to invent
a second one. They reuse the same CSS classes for the same reason.

Where they differ from the New Zealand pages, they differ on purpose:

  * Prices are AUD and reflect Australian rates, not converted New Zealand ones.
  * "Nearby" links to the other five metros rather than to neighbouring suburbs.
    Australia is open in six cities that are nowhere near each other, so the
    New Zealand "other Auckland areas" pattern would be nonsense here.
  * Every page carries Service, FAQPage and BreadcrumbList structured data with
    an Australian areaServed and AUD currency, so the rich result a search
    engine can build says the right country and the right money.
  * "Police check", not "criminal check" - the Australian term for the thing.

    python tools/au_city_page.py
"""
import io
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import (NZ_ORIGIN, AU_ORIGIN, AU_BASE, AU_ON_OWN_DOMAIN,
                         nz_url, au_url, au_path)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Origins live in site_config so a domain move is one edit, not three.
ORIGIN = NZ_ORIGIN
# Where the Australian pages live. While Australia was a subfolder AU_P was
# '/au'; now it has its own host it is '' and every internal link is just the
# bare path. Applied as a final pass over the built HTML (see localise) rather
# than threaded through fifty string concatenations.
AU_P = AU_BASE
AU_HOME = au_path('/')
CSS = '/styles.css?v=121'
NL = '\n'

NOTICE = ('\U0001F9FD Now open in Sydney, Melbourne, Brisbane, Perth, Hobart and Darwin - '
          'browse local cleaners, see their rates up front, and message the one you pick. '
          'Free for households and for cleaners while we grow.')

# slug, city, state, (low, typical, high) AUD hourly, hero line, local-knowledge line.
CITIES = [
    ('sydney', 'Sydney', 'New South Wales', (40, 55, 80),
     'Terraces in the inner west, apartments on the north shore, and a lot of people whose '
     'weekends are worth more than the four hours a proper clean takes.',
     'Strata buildings with tight access and shared laundries, and harbourside places where salt '
     'air marks the glass. Most Sydney cleans are apartments, so an hourly rate covers more of the '
     'home than it would elsewhere.'),
    ('melbourne', 'Melbourne', 'Victoria', (38, 50, 75),
     'Victorian terraces with ornate cornices, warehouse conversions in the north, and '
     'weatherboard homes further out.',
     'Period homes with high ceilings, picture rails and floorboards that show every speck. '
     'Melbourne dust settles fast, which is why fortnightly is the most common booking here.'),
    ('brisbane', 'Brisbane', 'Queensland', (35, 48, 70),
     'Queenslanders on stumps, with VJ walls, wide verandahs and ceiling fans that collect more '
     'than anyone expects.',
     'Humidity is the difference here. Bathrooms, window tracks and anywhere air sits still need '
     'more attention in Brisbane than they would down south, and a regular clean is what stops '
     'mould getting a start.'),
    ('perth', 'Perth', 'Western Australia', (35, 48, 70),
     'Big single-storey homes, limestone and tile, and a coastal wind that puts fine sand through '
     'everything.',
     'Perth homes are larger on average than the eastern states, so an hourly rate goes further '
     'per room. Sand and red dust are the constant, particularly through summer and anywhere near '
     'the coast.'),
    ('hobart', 'Hobart', 'Tasmania', (35, 45, 65),
     'Sandstone cottages in Battery Point, weatherboard through the northern suburbs, and winters '
     'that make damp the thing to stay ahead of.',
     'Cold, wet winters make mould in bathrooms and around window frames the recurring job in '
     'Hobart. Heritage cottages also need someone who knows not to take a harsh product to old '
     'timber or sandstone.'),
    ('darwin', 'Darwin', 'Northern Territory', (40, 55, 75),
     'Elevated tropical homes, louvres and open-plan living built for the heat.',
     'Wet-season humidity and red dust mean regular cleans matter more in Darwin than almost '
     'anywhere else in the country. Louvres, flyscreens and ceiling fans are what actually take '
     'the time.'),
]


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def head(title, desc, url, ld_blocks):
    """The shared <head>. Identical between the city pages and the hub."""
    lds = NL.join(
        '    <script type="application/ld+json">%s</script>'
        % json.dumps(b, separators=(',', ':')) for b in ld_blocks)
    return (
        '<!DOCTYPE html>' + NL +
        '<html lang="en-AU">' + NL +
        '  <head>' + NL +
        '    <meta charset="UTF-8" />' + NL +
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />' + NL +
        '    <script>window.MM_COUNTRY = "AU";</script>' + NL +
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
        '    <meta property="og:locale" content="en_AU" />' + NL +
        '    <meta property="og:image" content="' + AU_ORIGIN + '/og-image.png" />' + NL +
        '    <meta property="og:image:width" content="1200" />' + NL +
        '    <meta property="og:image:height" content="630" />' + NL +
        '    <meta name="twitter:card" content="summary_large_image" />' + NL +
        '    <meta name="twitter:image" content="' + AU_ORIGIN + '/og-image.png" />' + NL +
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
    return (
        '  <body class="pitch-body role-customer">' + NL +
        '    <div class="notice-bar">' + NL +
        '      ' + NOTICE + NL +
        '    </div>' + NL +
        '    <header class="pitch-top">' + NL +
        '      <a class="brand" href="/au"><img class="brand-mark" src="/assets/logo-mark.svg" '
        'alt="Match Maid" /></a>' + NL +
        '      <div class="pitch-top-right">' + NL +
        '        <a class="ulink cross-link" href="/au/for-maids">Are you a cleaner?</a>' + NL +
        '        <a class="ulink" href="/au/for-customers">Why Match Maid</a>' + NL +
        '        <a class="btn sm" href="/login?role=customer&amp;country=AU">Log in</a>' + NL +
        '        <a class="btn sm solid create" href="/au/browse">Browse cleaners</a>' + NL +
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
        '            <a class="btn solid lg" href="/au/browse">Browse cleaners</a>' + NL +
        '            <a class="btn outline lg" href="/au/for-maids">I\'m a cleaner</a>' + NL +
        '          </div>' + NL +
        '        </div>' + NL +
        '      </section>' + NL +
        '    </main>' + NL + NL +
        '    <footer class="splash-footer accent">' + NL +
        '      <div class="sf-inner">' + NL +
        '        <a class="brand" href="/au"><img class="brand-mark" src="/assets/logo-mark.svg" '
        'alt="Match Maid" /></a>' + NL +
        '        <nav class="sf-links">' + NL +
        '          <a href="/au/for-customers">For households</a>' + NL +
        '          <a href="/au/for-maids">For cleaners</a>' + NL +
        '          <a href="/au/cleaners">Cleaners by city</a>' + NL +
        '          <a href="/terms">Terms</a>' + NL +
        '          <a href="/privacy">Privacy</a>' + NL +
        '        </nav>' + NL +
        '        <p class="sf-note">&copy; Match Maid &middot; Australia &middot; '
        '<a href="mailto:hello@matchmaid.co.nz">hello@matchmaid.co.nz</a></p>' + NL +
        '        <p class="footer-disclaimer">Match Maid is a directory service only. We do not '
        'accept liability for cleaning issues or disputes. Please do thorough due diligence and pay '
        'for services directly to the cleaner upon job completion.</p>' + NL +
        '      </div>' + NL +
        '    </footer>' + NL +
        '    <script src="/reveal.js?v=6"></script>' + NL +
        '    <script src="/geo-banner.js?v=1"></script>' + NL +
        '  </body>' + NL +
        '</html>' + NL
    )


def faqs(city, rates):
    lo, mid, hi = rates
    return [
        ('How much does a house cleaner cost in %s?' % city,
         'Cleaners on Match Maid set and show their own hourly rates up front, so you can compare '
         'before you contact anyone. Rates advertised across %s run from about $%d to $%d an hour, '
         'with most around $%d depending on the cleaner and the type of clean.' % (city, lo, hi, mid)),
        ('Are Match Maid cleaners in %s vetted?' % city,
         'Cleaners can add ID-verified, police-check and insured badges to their profile, so you '
         'can see who has been checked before you let anyone into your home. You always choose who '
         'to contact.'),
        ('Is Match Maid free for households?',
         'Yes - browsing, comparing and contacting cleaners in %s is completely free for '
         'households. You arrange the clean and payment directly with your cleaner, and Match Maid '
         'never takes a commission.' % city),
        ('Which %s suburbs are covered?' % city,
         'All of them. Cleaners set the suburbs they travel to, and the search only shows you '
         'people who cover yours - so a result in %s is someone who will actually come to your '
         'address.' % city),
    ]


def city_page(slug, city, state, rates, hero, local, others):
    url = au_url('/cleaners/%s' % slug)
    title = 'House cleaners in %s, %s | Match Maid' % (city, state)
    desc = ('Find a trusted local house cleaner in %s. Browse independent cleaners with rates up '
            'front, read reviews, and contact the one you choose. Free for households.' % city)
    lo, mid, hi = rates
    qa = faqs(city, rates)

    ld_service = {
        '@context': 'https://schema.org', '@type': 'Service',
        'serviceType': 'House cleaning',
        'provider': {'@type': 'Organization', 'name': 'Match Maid', 'url': au_url('/')},
        'areaServed': {
            '@type': 'City', 'name': city,
            'containedInPlace': {
                '@type': 'AdministrativeArea', 'name': state,
                'containedInPlace': {'@type': 'Country', 'name': 'Australia'}}},
        # The money a search engine shows has to be the money the customer pays.
        'offers': {'@type': 'AggregateOffer', 'priceCurrency': 'AUD',
                   'lowPrice': lo, 'highPrice': hi, 'unitText': 'HUR'},
        'description': 'Match Maid connects households in %s with independent local house '
                       'cleaners.' % city,
    }
    ld_faq = {'@context': 'https://schema.org', '@type': 'FAQPage',
              'mainEntity': [{'@type': 'Question', 'name': q,
                              'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in qa]}
    ld_crumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Match Maid Australia', 'item': au_url('/')},
        {'@type': 'ListItem', 'position': 2, 'name': 'Cleaners by city',
         'item': au_url('/cleaners')},
        {'@type': 'ListItem', 'position': 3, 'name': city, 'item': url},
    ]}

    faq_html = NL.join(
        '          <div class="faq-item reveal"><h3>%s</h3><p>%s</p></div>' % (esc(q), esc(a))
        for q, a in qa)
    other_html = NL.join(
        '            <a class="area-link" href="/au/cleaners/%s">%s</a>' % (s, c)
        for s, c in others)

    body = (
        '    <main>' + NL +
        '      <section class="pitch-hero container hero-grid">' + NL +
        '        <div class="hero-copy">' + NL +
        '          <p class="eyebrow">' + esc(state) + ' &middot; ' + esc(city) + '</p>' + NL +
        '          <h1>House cleaners<br />in ' + esc(city) + '.</h1>' + NL +
        '          <p class="lede">' + NL +
        '            ' + esc(hero) + ' Browse independent local cleaners who cover ' + esc(city) +
        ', see their transparent hourly rates, and message the one you like. No bidding wars, '
        'no middlemen, and it\'s free for households.' + NL +
        '          </p>' + NL +
        '          <div class="hero-actions">' + NL +
        '            <a class="btn solid lg" href="/au/browse">Find a cleaner in ' + esc(city) +
        '</a>' + NL +
        '            <a class="btn outline lg" href="/au/for-maids">List your services</a>' + NL +
        '          </div>' + NL +
        '          <img class="trust-badges" src="/assets/brand/trust_badges_au.svg" alt="Cleaners '
        'can be verified, police checked and insured" />' + NL +
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
        '          <div class="benefit"><span class="b-mark">01 &middot; FREE</span><h3>Always free '
        'for you</h3><p>Search, compare and contact ' + esc(city) + ' cleaners at no cost. We will only ever take a small '
        'monthly fee from cleaners, which keeps the service free for customers.'
        '</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">02 &middot; TRANSPARENT</span><h3>Rates '
        'up front</h3><p>Every cleaner\'s hourly rate is shown before you get in touch. We want full '
        'transparency for customers.</p></div>' + NL +
        '          <div class="benefit"><span class="b-mark">03 &middot; YOUR PICK</span><h3>Choose '
        'your own cleaner</h3><p>See reviews and verified badges, then pick the person who\'s the '
        'right fit for your home.</p></div>' + NL +
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
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-mist secbg-pad">' + NL +
        '        <p class="eyebrow reveal">Also open in</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">Other cities we cover</h2>' + NL +
        '        <p class="reveal" style="max-width:60ch">Match Maid is open in six Australian '
        'cities, with more added as the network grows. Not in ' + esc(city) +
        '? <a href="/au/browse">Search your own suburb</a>.</p>' + NL +
        '        <div class="area-links reveal">' + NL +
        other_html + NL +
        '            <a class="area-link" href="/au/cleaners">All cities</a>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL
    )
    return (head(title, desc, url, [ld_service, ld_faq, ld_crumb]) + chrome_top() + body +
            chrome_bottom('Find your %s cleaner.' % city))


def hub_page():
    url = au_url('/cleaners')
    title = 'House cleaners by city in Australia | Match Maid'
    desc = ('Browse independent local house cleaners by city - Sydney, Melbourne, Brisbane, Perth, '
            'Hobart and Darwin. Rates up front, free for households.')
    ld = {'@context': 'https://schema.org', '@type': 'ItemList',
          'name': 'Australian cities Match Maid covers',
          'itemListElement': [
              {'@type': 'ListItem', 'position': i + 1, 'name': c,
               'item': au_url('/cleaners/%s' % s)}
              for i, (s, c, _st, _r, _h, _l) in enumerate(CITIES)]}
    # Reuses .benefit, the same card the New Zealand hub uses; a new class would
    # have needed new CSS to say exactly the same thing.
    cards = NL.join(
        '          <a class="benefit" href="/au/cleaners/%s">' % s + NL +
        '            <span class="b-mark">%s</span>' % esc(st.upper()) + NL +
        '            <h3>%s</h3>' % esc(c) + NL +
        '            <p>Independent local cleaners across %s, with their hourly rates shown up '
        'front.</p>' % esc(c) + NL +
        '          </a>'
        for s, c, st, _r, _h, _l in CITIES)

    body = (
        '    <main>' + NL +
        '      <section class="pitch-hero container">' + NL +
        '        <div class="hero-copy">' + NL +
        '          <p class="eyebrow">Australia</p>' + NL +
        '          <h1>House cleaners,<br />city by city.</h1>' + NL +
        '          <p class="lede">' + NL +
        '            Match Maid is open in six Australian cities. Pick yours to see what a clean '
        'costs there and who covers your suburb - or <a href="/au/browse">search your suburb '
        'directly</a>. Free for households, and no commission taken from cleaners.' + NL +
        '          </p>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container">' + NL +
        '        <div class="benefit-grid reveal">' + NL +
        cards + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL
    )
    return (head(title, desc, url, [ld]) + chrome_top() + body +
            chrome_bottom('Find your cleaner.'))


def localise(html):
    """Point every internal link at wherever Australia currently lives.

    The templates are written with /au paths because that is what they were
    born with; this is the single place that knows better. href="/au" is
    handled before the /au/ prefix so the bare root does not become "//".
    """
    return (html
            .replace('href="/au"', 'href="%s"' % AU_HOME)
            .replace('"/au/', '"%s/' % AU_P))


def build():
    out_dir = os.path.join(ROOT, 'au', 'cleaners')
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for slug, city, state, rates, hero, local in CITIES:
        others = [(s, c) for s, c, _st, _r, _h, _l in CITIES if s != slug]
        html = localise(city_page(slug, city, state, rates, hero, local, others))
        io.open(os.path.join(out_dir, slug + '.html'), 'w', encoding='utf-8',
                newline='').write(html)
        written.append('au/cleaners/%s.html' % slug)
    io.open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8',
            newline='').write(localise(hub_page()))
    written.append('au/cleaners/index.html')
    return written


if __name__ == '__main__':
    for w in build():
        print('built', w)
