# Deploying Match Maid to your domain (Cloudflare)

The app is one Node service that serves both the API and the static site, plus a
Postgres database. We'll deploy in this order:

1. **Database** — Neon (free Postgres)
2. **App** — Render (free Node web service)
3. **Domain** — point Cloudflare DNS at Render

---

## 1. Database (Neon)

1. Sign up at https://neon.tech and create a project.
2. Copy the **connection string** (starts with `postgresql://...?sslmode=require`).
3. Load the schema + seed data into it. From this project's `server/` folder:
   - create `server/.env` with `DATABASE_URL=<your Neon string>`
   - run `npm install` then `npm run migrate`
   (Claude can do this step for you once you paste the connection string.)

## 2. App (Render)

1. Push this project to a **GitHub repo** (see "Git" below).
2. At https://render.com → **New → Web Service** → connect the repo.
   Render reads `render.yaml` automatically (root dir `server`, start `node server.js`).
3. In the service's **Environment**, add `DATABASE_URL` = your Neon string.
4. Deploy. You'll get a URL like `https://matchmaid.onrender.com` — confirm the
   site loads there.

## 3. Domain (Cloudflare)

1. In Render → your service → **Settings → Custom Domains** → add both
   `matchmaid.co.nz` and `www.matchmaid.co.nz`. Render shows a target host.
2. In Cloudflare → your domain → **DNS → Records**, add:
   - `CNAME` `@`   → `matchmaid.onrender.com`  (Cloudflare flattens root CNAMEs)
   - `CNAME` `www` → `matchmaid.onrender.com`
   Set **Proxy status: DNS only** (grey cloud) first so Render can issue the TLS
   cert; you can switch to Proxied later.
3. In Cloudflare → **SSL/TLS**, set mode to **Full (strict)**.
4. Wait for Render to show the domain as **Verified / Certificate issued**
   (usually minutes). Done — visit https://matchmaid.co.nz.

---

## Git (one-time)

This folder is now a git repo. To publish it:

```bash
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/matchmaid.git
git branch -M main
git push -u origin main
```

## Notes
- Render's free web service **sleeps after inactivity** (first hit is slow). A
  paid instance (~$7/mo) stays always-on.
- Secrets: `.env` is git-ignored and Express ignores dotfiles, so your DB
  password is never committed or served.
- The same repo works on Railway or Fly.io if you prefer; only the host UI differs.
