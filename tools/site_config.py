# -*- coding: utf-8 -*-
"""Where each country's site lives. The one place that changes on a domain move.

Australia currently lives in a subfolder of the New Zealand domain. That is a
stopgap: Google treats .co.nz as hard-geotargeted to New Zealand, and Search
Console's country setting is unavailable for a ccTLD, so no amount of hreflang
will make /au rank in Australia. The fix is a .com.au, and this file is what
makes that a one-line change instead of a hunt through three generators.

To move Australia onto its own domain:

  1. Register matchmaid.com.au (needs an Australian presence - an ABN, ARBN or
     an Australian trade mark application).
  2. Point it at the same Render service as matchmaid.co.nz.
  3. Set AU_ORIGIN below to 'https://matchmaid.com.au' and AU_BASE to ''.
  4. Set AU_DOMAIN=matchmaid.com.au in the server environment, which switches
     on host-based routing: that host serves the Australian pages at its root.
  5. Re-run all three generators, then commit.

Do NOT do step 3 before the domain resolves. A canonical pointing at a domain
that does not answer tells Google the real page does not exist, and it will
drop the one that does.
"""
import os

NZ_ORIGIN = 'https://matchmaid.co.nz'
NZ_BASE = ''

# Australia moved onto its own domain on 26 August 2026. AU_DOMAIN is set on
# Render, so that host serves the Australian pages at its root and /au is a
# permanent redirect to it.
AU_ORIGIN = os.environ.get('AU_ORIGIN', 'https://matchmaid.com.au')
AU_BASE = os.environ.get('AU_BASE', '')

# True once Australia has its own domain. Several things change at that point:
# hreflang becomes cross-domain, the /au prefix disappears from internal links,
# and the geo steering is no longer load-bearing for search (the ccTLD does that
# job) - it only stays if you still want /au hidden from New Zealand visitors.
AU_ON_OWN_DOMAIN = AU_ORIGIN != NZ_ORIGIN


def nz_url(path=''):
    """Absolute URL for a New Zealand page. path is root-relative ('/browse')."""
    return NZ_ORIGIN + (path or '/')


def au_url(path=''):
    """Absolute URL for an Australian page, given its path WITHOUT the /au prefix.

    au_url('/browse') is https://matchmaid.co.nz/au/browse today and
    https://matchmaid.com.au/browse once the domain moves.
    """
    if not path or path == '/':
        return AU_ORIGIN + (AU_BASE or '/')
    return AU_ORIGIN + AU_BASE + path


def au_path(path=''):
    """Root-relative path for an Australian page, for use in an href."""
    if not path or path == '/':
        return AU_BASE or '/'
    return AU_BASE + path
