# -*- coding: utf-8 -*-
"""Service landing pages for the New Zealand side.

    python tools/nz_service_page.py

The city and suburb pages answer "who is near me". These answer "who does the
specific job I need doing", which is the higher-intent half of the search: a
household typing "end of tenancy cleaning" has a date and a property manager,
not a vague plan to get some help.

WHAT GETS A PAGE, AND WHY THE LIST IS SHORT. Only cleans the product can
actually filter for. `service_types` holds seven rows, but four of them
(carpet, oven, windows, one-off) have no cleaner offering them - they are
leftovers from an older model. A page for "oven cleaning" would rank, take the
click, and hand the visitor a search that cannot return anyone, which is worse
than not ranking. Add a page here when the supply exists, not before:

    select st.slug, count(distinct cs.cleaner_id)
      from cleaner_services cs
      join service_types st on st.id = cs.service_type_id
      join cleaner_profiles cp on cp.id = cs.cleaner_id
     where cp.listing_status = 'active' group by 1

Regular cleaning deliberately has no page of its own: the home page,
/for-customers and every city page already target it, and a fifth page saying
the same thing would compete with them rather than add anything.

Each page deep-links into /browse with its own clean type preselected, so the
choice the visitor already made on the way in is not asked again.

Rates are what cleaners currently advertise, as at 8 September 2026. Same
caveat as the city pages: re-run the query when they drift.
"""
import io
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from site_config import NZ_ORIGIN, nz_url


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = NZ_ORIGIN
CSS = '/styles.css?v=125'
NL = '\n'

NOTICE = ('\U0001F9FD Now open across New Zealand - browse local cleaners, see their rates up '
          'front, and message the one you pick. Free for households and for cleaners while we '
          'grow.')

# page slug, browse service slug, page data. `terms` are the other words people
# search for the same job - they belong in the copy, not in a thin page each.
SERVICES = [
    {
        'slug': 'end-of-tenancy-cleaning',
        'service': 'end-of-tenancy',
        'name': 'End of tenancy cleaning',
        'eyebrow': 'Moving out',
        'h1': ['End of tenancy', 'cleaning.'],
        'title': 'End of tenancy cleaning NZ | Bond cleans, rates up front | Match Maid',
        'desc': ('Book an end of tenancy or bond clean with an independent local cleaner. See '
                 'hourly rates before you get in touch, and choose a cleaner who offers a '
                 'bond-back guarantee. Free for households.'),
        'lede': ('A bond clean is the one with a deadline and someone else marking it. Browse '
                 'independent cleaners who do end-of-tenancy work, see what they charge before '
                 'you make contact, and pick one who offers a bond-back guarantee.'),
        'rates': (29, 55, 80),
        'rate_note': ('End-of-tenancy work is priced off a cleaner\'s deep-clean rate - currently '
                      '$29 to $80 an hour, with most between $50 and $65. A three-bedroom house '
                      'usually takes five to seven hours, so budget roughly $275 to $450 all up. '
                      'Some cleaners will quote a fixed price once they have seen the property.'),
        'includes_title': 'What a bond clean covers',
        'includes_lede': ('An end-of-tenancy clean is a deep clean with the inspection sheet in '
                          'mind. On Match Maid it is built on the deep clean, so it covers '
                          'everything a deep clean does:'),
        'includes': [
            'Oven, racks and trays',
            'Inside the fridge and freezer',
            'Interior windows, sills and tracks',
            'Inside cupboards and drawers',
            'Carpet cleaning',
            'Wall wash and skirting boards',
            'Bathrooms, including grout and shower glass',
            'Kitchen, including rangehood and splashback',
        ],
        'faqs': [
            ('How much does an end of tenancy clean cost in New Zealand?',
             'It is priced off the cleaner\'s deep-clean hourly rate, which on Match Maid runs '
             'from $29 to $80 an hour with most between $50 and $65. A three-bedroom house '
             'typically takes five to seven hours, so about $275 to $450. Cleaners set and show '
             'their own rate, so you can compare before you contact anyone.'),
            ('Is it called a bond clean or an end of tenancy clean?',
             'Both, and they are the same job. You will also see it called a move-out clean or a '
             'vacate clean. Whatever the listing calls it, what a property manager checks is the '
             'same list: oven, carpets, windows, inside cupboards and the bathrooms.'),
            ('What is a bond-back guarantee?',
             'Some cleaners offer to come back and put things right at no extra charge if the '
             'property manager is not satisfied. It shows as a badge on their profile, so you can '
             'see who offers it before you get in touch. It is an agreement between you and the '
             'cleaner - Match Maid is a directory and is not party to it.'),
            ('Is carpet cleaning included?',
             'It is part of the deep clean these are built on, but confirm it with your cleaner '
             'before you book. Some tenancy agreements require a professional machine clean with '
             'a receipt, which is a different job from a thorough vacuum.'),
            ('How long does an end of tenancy clean take?',
             'Longer than people expect. A one-bedroom flat is usually three to four hours; a '
             'three-bedroom house five to seven; a large family home can be a full day with two '
             'cleaners. An empty property is faster than a furnished one.'),
            ('When should I book it?',
             'As soon as you have a moving date, and for after the furniture is out - a clean '
             'around boxes is a clean you will partly redo. Cleaners fill up at the end of the '
             'month and over the summer moving season, so two to three weeks ahead is sensible.'),
            ('Do I get a receipt for the property manager?',
             'Ask your cleaner - most will provide one, and it is worth having. You arrange the '
             'job and pay the cleaner directly, so the receipt comes from them rather than from '
             'Match Maid.'),
        ],
        'cta': 'Find your bond cleaner.',
    },
    {
        'slug': 'deep-cleaning',
        'service': 'deep',
        'name': 'Deep cleaning',
        'eyebrow': 'One-off',
        'h1': ['Deep cleaning', 'services.'],
        'title': 'Deep cleaning services NZ | What is included, real rates | Match Maid',
        'desc': ('Book a one-off deep clean with an independent local cleaner. See what a deep '
                 'clean includes, what cleaners actually charge, and contact the one you choose. '
                 'Free for households.'),
        'lede': ('The clean that gets the oven, the windows and the places a weekly tidy never '
                 'reaches. Browse independent local cleaners who offer deep cleans, see their '
                 'hourly rates up front, and message the one you like.'),
        'rates': (29, 55, 80),
        'rate_note': ('Deep cleans on Match Maid run from $29 to $80 an hour, with most between '
                      '$50 and $65 - higher than a regular clean, and more hours as well. A '
                      'three-bedroom house usually takes five to seven hours.'),
        'includes_title': 'What a deep clean covers',
        'includes_lede': ('A deep clean is not a longer regular clean, it is a different list. On '
                          'top of everything a regular clean does, it covers:'),
        'includes': [
            'Oven, racks and trays',
            'Inside the fridge and freezer',
            'Interior windows, sills and tracks',
            'Inside cupboards and drawers',
            'Carpet cleaning',
            'Wall wash and skirting boards',
            'Rangehood, splashback and behind appliances',
            'Grout, shower glass and extractor fans',
        ],
        'faqs': [
            ('What is the difference between a deep clean and a regular clean?',
             'A regular clean maintains a home: kitchen, bathrooms, floors, surfaces, beds. A deep '
             'clean adds the things that only need doing occasionally - the oven, inside the '
             'fridge, interior windows, inside cupboards, carpet and a wall wash. It is a '
             'different job, not a longer version of the same one.'),
            ('How much does a deep clean cost?',
             'Cleaners on Match Maid advertise $29 to $80 an hour for a deep clean, with most '
             'between $50 and $65. At around $55 an hour a three-bedroom house works out to '
             'roughly $275 to $385. Every rate is shown on the profile before you make contact.'),
            ('How long does a deep clean take?',
             'Two to three times as long as a regular clean of the same home. A one-bedroom flat '
             'is usually three to four hours, a three-bedroom house five to seven. If the house '
             'has not had one in a while, expect the upper end.'),
            ('How often should I get a deep clean?',
             'Once or twice a year suits most homes, often at the start of spring. Households with '
             'a regular fortnightly cleaner tend to need one less often, because the surfaces that '
             'take the longest never get the chance to build up.'),
            ('Should I get a deep clean before starting a regular cleaner?',
             'It is usually worth it. Starting a fortnightly arrangement on a house that has been '
             'reset takes fewer hours per visit from then on, so the deep clean pays some of '
             'itself back. Plenty of cleaners on Match Maid offer both and will do it that way.'),
            ('Does a deep clean include the windows and the carpet?',
             'Interior windows, sills and tracks, yes. Carpet cleaning is on the list too, but '
             'confirm with your cleaner whether that means a thorough vacuum or a machine clean - '
             'they are different jobs and not every cleaner carries a machine.'),
        ],
        'cta': 'Book your deep clean.',
    },
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


def chrome_bottom(cta_heading, service):
    return (
        '      <section class="pitch-cta">' + NL +
        '        <div class="narrow reveal">' + NL +
        '          <p class="eyebrow">Ready when you are</p>' + NL +
        '          <h2>' + esc(cta_heading) + '</h2>' + NL +
        '          <div class="hero-actions" style="justify-content:center; margin-top:2rem">' + NL +
        '            <a class="btn solid lg" href="/browse?service=' + service +
        '">Browse cleaners</a>' + NL +
        '            <a class="btn outline lg" href="/house-cleaning-prices">What a clean '
        'costs</a>' + NL +
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


def service_page(d):
    url = nz_url('/' + d['slug'])
    lo, mid, hi = d['rates']
    browse = '/browse?service=' + d['service']

    ld_service = {
        '@context': 'https://schema.org', '@type': 'Service',
        'serviceType': d['name'],
        'provider': {'@type': 'Organization', 'name': 'Match Maid', 'url': nz_url('/')},
        'areaServed': {'@type': 'Country', 'name': 'New Zealand'},
        'offers': {'@type': 'AggregateOffer', 'priceCurrency': 'NZD',
                   'lowPrice': lo, 'highPrice': hi, 'unitText': 'HUR'},
        'description': d['desc'],
    }
    ld_faq = {'@context': 'https://schema.org', '@type': 'FAQPage',
              'mainEntity': [{'@type': 'Question', 'name': q,
                              'acceptedAnswer': {'@type': 'Answer', 'text': a}}
                             for q, a in d['faqs']]}
    ld_crumb = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Match Maid', 'item': nz_url('/')},
        {'@type': 'ListItem', 'position': 2, 'name': d['name'], 'item': url},
    ]}

    incl_html = NL.join('            <li>%s</li>' % esc(i) for i in d['includes'])
    faq_html = NL.join(
        '          <div class="faq-item reveal"><h3>%s</h3><p>%s</p></div>' % (esc(q), esc(a))
        for q, a in d['faqs'])

    body = (
        '    <main>' + NL +
        '      <nav class="crumbs container" aria-label="Breadcrumb">' + NL +
        '        <a href="/">Match Maid</a> <span aria-hidden="true">&rsaquo;</span> '
        '<span aria-current="page">' + esc(d['name']) + '</span>' + NL +
        '      </nav>' + NL +
        '      <section class="pitch-hero container hero-grid">' + NL +
        '        <div class="hero-copy">' + NL +
        '          <p class="eyebrow">' + esc(d['eyebrow']) + '</p>' + NL +
        '          <h1>' + esc(d['h1'][0]) + '<br />' + esc(d['h1'][1]) + '</h1>' + NL +
        '          <p class="lede">' + NL +
        '            ' + esc(d['lede']) + NL +
        '          </p>' + NL +
        '          <div class="hero-actions">' + NL +
        '            <a class="btn solid lg" href="' + browse + '">Find a cleaner</a>' + NL +
        '            <a class="btn outline lg" href="/house-cleaning-prices">What a clean '
        'costs</a>' + NL +
        '          </div>' + NL +
        '          <img class="trust-badges" src="/assets/brand/trust_badges.svg" alt="Cleaners '
        'can be verified, criminal checked and insured" />' + NL +
        '        </div>' + NL +
        '        <div class="hero-art"><img src="/assets/brand/hero_graphic.svg" alt="A Match Maid '
        'cleaner listing with reviews and a message button" /></div>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-tint secbg-pad">' + NL +
        '        <p class="eyebrow reveal">What you get</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">' + esc(d['includes_title']) +
        '</h2>' + NL +
        '        <p class="reveal" style="max-width:64ch; margin-bottom:1.4rem">' +
        esc(d['includes_lede']) + '</p>' + NL +
        '        <ul class="tick-list reveal">' + NL +
        incl_html + NL +
        '        </ul>' + NL +
        '        <p class="reveal" style="max-width:64ch; margin-top:1.4rem">Cleaners set their '
        'own scope, so check the profile before you get in touch - what is listed here is what the '
        'clean covers on Match Maid, not a promise about any one cleaner.</p>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container">' + NL +
        '        <p class="eyebrow reveal">The money</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">What it costs</h2>' + NL +
        '        <p class="reveal" style="max-width:64ch">' + esc(d['rate_note']) + '</p>' + NL +
        '        <p class="reveal" style="margin-top:1.2rem"><a href="/house-cleaning-prices">'
        'See the full price breakdown</a> - by clean type, by home size, and what actually moves '
        'the number.</p>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container secbg secbg-mist secbg-pad">' + NL +
        '        <p class="eyebrow reveal">Good to know</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1.4rem">' + esc(d['name']) +
        ' - your questions</h2>' + NL +
        '        <div class="faq-list">' + NL +
        faq_html + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL +
        '      <section class="section container">' + NL +
        '        <p class="eyebrow reveal">Where you are</p>' + NL +
        '        <h2 class="reveal" style="margin-bottom:1rem">Cleaners near you</h2>' + NL +
        '        <p class="reveal" style="max-width:60ch">Cleaners set the suburbs they travel to, '
        'so the search only shows people who cover yours.</p>' + NL +
        '        <div class="area-links reveal">' + NL +
        '            <a class="area-link" href="/browse?service=' + d['service'] +
        '&amp;town=Auckland">Auckland</a>' + NL +
        '            <a class="area-link" href="/browse?service=' + d['service'] +
        '&amp;town=Christchurch">Christchurch</a>' + NL +
        '            <a class="area-link" href="/cleaners">All areas</a>' + NL +
        '        </div>' + NL +
        '      </section>' + NL + NL
    )
    return (head(d['title'], d['desc'], url, [ld_service, ld_faq, ld_crumb]) + chrome_top() +
            body + chrome_bottom(d['cta'], d['service']))


def build():
    written = []
    for d in SERVICES:
        io.open(os.path.join(ROOT, d['slug'] + '.html'), 'w', encoding='utf-8',
                newline='').write(service_page(d))
        written.append(d['slug'] + '.html')
    return written


if __name__ == '__main__':
    for w in build():
        print('built', w)
