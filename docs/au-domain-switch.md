# Moving Australia onto matchmaid.com.au

> **Done — 26 August 2026.** `matchmaid.com.au` is live on Render behind
> Cloudflare, `AU_DOMAIN` is set, and every canonical, og:url, hreflang and
> structured-data `@id` on the Australian pages points at it. `/au` is a
> permanent 301 to the new domain. What follows is the record of how, and what
> to check if any of it needs redoing.


Australia currently lives at `matchmaid.co.nz/au`. That works, but it cannot
rank: Google treats `.co.nz` as hard-geotargeted to New Zealand, and Search
Console's international targeting setting is unavailable for a ccTLD, so no
amount of hreflang will get `/au` into Australian results. The subfolder is a
staging area, not the destination.

Everything below is already built and tested against a simulated
`matchmaid.com.au`. The move is a DNS change and two settings.

## Before you start

`.com.au` needs an **Australian presence**, checked at registration and
continuously — if it lapses, the licence is cancelled. Any one of:

- an **ABN** or **ACN** (an Australian business registration)
- an **ARBN** (a foreign company registered with ASIC)
- an **Australian trade mark**, including a *pending* application — but if this
  is your only qualification, the domain must exactly match the trade marked
  words

## Steps

1. **Register `matchmaid.com.au`** through an Australian registrar. As of the
   last check `matchmaid.com.au`, `matchmaid.au` and `matchmaid.net.au` were all
   unregistered. Consider taking `matchmaid.au` at the same time so nobody else
   does.

2. **Point it at the same Render service** as `matchmaid.co.nz`. Add it as a
   custom domain in Render, then set the DNS records Render gives you. If it
   sits behind Cloudflare like the New Zealand domain, add the zone there first
   and turn on **IP Geolocation** (Network settings) — the `CF-IPCountry` header
   is what the geo rules read, and without it every visitor looks unknown.

3. **Wait for it to actually resolve.** Do not do step 4 first. A canonical
   pointing at a domain that does not answer tells Google the real page does not
   exist, and it will drop the one that does.

4. **Set the server environment** on Render:

   ```
   AU_DOMAIN=matchmaid.com.au
   ```

   That switches on host-based routing: requests to that host serve the
   Australian pages at its root, `/au/*` on that host 301s to the bare path so
   there is only ever one URL per page, and API calls default to Australian data
   without needing `?country=AU`.

5. **Regenerate the pages** with the new origin:

   ```
   cd tools
   # edit site_config.py:
   #   AU_ORIGIN = 'https://matchmaid.com.au'
   #   AU_BASE   = ''
   cd .. && python tools/build-au.py && python tools/au_city_page.py && python tools/build-sitemap.py
   ```

   Canonicals, og:url and hreflang all move to the new domain, and hreflang
   becomes cross-domain in both the pages and the sitemap. Commit and deploy.

6. **Search Console**: add `matchmaid.com.au` as a new property and submit
   `https://matchmaid.com.au/sitemap.xml`. The old `/au` URLs will 301 to the new
   domain, which is what carries any authority they had picked up across.

7. **Keep `/au` redirecting.** Do not delete it. The pages have been live and
   indexed; removing them turns real URLs into 404s instead of moves.

## What to check afterwards

```
curl -s -o /dev/null -w '%{http_code}\n' https://matchmaid.com.au/
curl -s https://matchmaid.com.au/ | grep -o 'rel="canonical" href="[^"]*"'
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://matchmaid.com.au/au
curl -s https://matchmaid.com.au/sitemap.xml | grep -c '<loc>'
```

Expected: `200`; a canonical on `matchmaid.com.au`; a `301` from `/au` to `/`;
32 URLs.

The regression suite lives in the session scratchpad as `au-domain-test.mjs` —
run it against a server with `AU_DOMAIN` set and it exercises all of the above.

## Steering

`GEO_STEER` has three settings and defaults to **`redirect`**:

| Value | What happens |
|---|---|
| `redirect` (default) | An Australian IP on the New Zealand site is sent to the same page on `matchmaid.com.au`, and a New Zealand IP on the Australian site is sent back. `?stay=1` is the escape. |
| `banner` | Serve what was asked for; the page offers the other country in a dismissible bar. |
| `off` | Nothing. |

I argued for `banner` and Jack chose `redirect`. Recording why, because two of
my three objections do not survive contact with this direction of travel:

- **Crawling.** We never redirect when Cloudflare cannot place the visitor, and
  Googlebot crawls from the United States — so it is never redirected and both
  sites stay fully crawlable. Real risk for a blanket rule; not for this one.
- **Sharing.** Sending an Australian who was handed a `.co.nz` link to the same
  page on `.com.au` is closer to a feature than a bug.
- **Trust.** This one stands — being moved somewhere you did not ask to go can
  read as broken. That is what `?stay=1` and its cookie are for.

**To view the Australian site from New Zealand:** add `?stay=1` to any URL. It
sets a cookie for 30 days. Without it you are bounced back, like any other New
Zealand visitor.

The banner only appears when the visitor is in the *other* country AND the page
has a twin there. `/cleaners/ponsonby` never offers Australia: New Zealand has
suburb pages and Australia has city pages, so there is nothing to switch to.

The `/au` redirects are NOT steering and are unaffected by this setting — a
moved page is a moved page, and that one is a 301 for everyone.
