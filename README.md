# matchmaid

Match Maid — the local cleaning marketplace connecting independent cleaners with the households that need them.

- Static front-end (splash, role pitch pages, ungated browse, portals) + Node/Express API.
- PostgreSQL (Neon) database; schema + seed in `server/migrations/`.
- Deployment guide in [`DEPLOY.md`](DEPLOY.md).

## Run locally
```
cd server
npm install
# create server/.env with DATABASE_URL=...
npm run migrate
npm start        # http://localhost:3000
```
