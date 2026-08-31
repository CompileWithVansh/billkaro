# BillKaro — Touch POS for iPad

A fast, touch-first billing counter you can run on an iPad (or any browser).
Shopkeepers add items → each becomes a big button → tap to build a bill →
generate a UPI payment QR → manage multiple tables with Chrome-style tabs.

## Features
- JWT login / store registration
- Add items; each item auto-becomes a color-coded button
- Rearrange buttons by drag-and-drop; lock the layout so buttons don't move while billing
- Tap a button to add quantity; tap again to increment; live subtotal + tax + total
- Multi-bill tabs (like browser tabs) so one cashier can juggle several tables
- Payment QR generated locally from the store's UPI ID (Paytm/PhonePe/GPay/BHIM all scan it) — no paid API keys
- Fully responsive: side-by-side on landscape iPad, stacked on portrait/phones

## Tech
- Backend: Node + Express + JWT + bcrypt, JSON-file datastore (zero native deps — installs anywhere)
- Frontend: React + Vite + TypeScript, dnd-kit (drag), qrcode (QR)

## Local development (two processes, hot reload)

Backend:
```
cd backend
npm install
copy .env.example .env      # optional; dev works out of the box
npm run dev                 # http://localhost:4000
```

Frontend:
```
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
The frontend auto-targets `http://localhost:4000/api` in dev, so no config is
needed. To test on a real iPad over your LAN, set `VITE_API_URL` to your
computer's IP (e.g. `http://192.168.1.50:4000/api`) and set the backend
`CORS_ORIGIN` to the iPad-facing frontend origin.

## Production — single process (recommended)

In production the backend serves the built frontend, so the whole app runs as
**one process on one URL** (no CORS, no second host). The frontend then talks to
same-origin `/api` automatically.

```
# from the billkaro/ root
npm --prefix frontend install
npm --prefix frontend run build      # produces frontend/dist
npm --prefix backend install

# run
set NODE_ENV=production
set JWT_SECRET=<a long random string>
set DATA_DIR=C:\path\to\persistent\data   # optional; where data.json lives
npm --prefix backend start           # serves API + SPA on PORT (default 4000)
```
On Linux/macOS use `export` instead of `set`.

> The server refuses to start in production unless `JWT_SECRET` is set to a
> strong value (>=16 chars).

## Deploy options

### Docker
```
docker build -t billkaro .
docker run -p 4000:4000 \
  -e JWT_SECRET="a-long-random-secret" \
  -v billkaro_data:/data \
  billkaro
```
The image builds the frontend, runs the backend, and stores `data.json` on the
`/data` volume so it survives restarts.

### Render (one click)
This repo includes `render.yaml`. Create a new Blueprint on Render pointing at
the repo — it provisions a web service, generates a `JWT_SECRET`, mounts a 1 GB
persistent disk at `/data`, and health-checks `/api/health`.

### Any VPS / Railway / Fly
Build the frontend, then run `node backend/src/server.js` with `NODE_ENV=production`,
a `JWT_SECRET`, and a `DATA_DIR` on persistent storage. Put it behind the
platform's TLS/proxy (the server already trusts one proxy hop).

## Environment variables

Backend (`backend/.env`):

| Var | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | prod | `production` enables prod checks + SPA serving |
| `PORT` | no | Port to listen on (platforms set this) |
| `JWT_SECRET` | prod | Signing secret; must be strong in production |
| `JWT_EXPIRES_IN` | no | Token lifetime (default `7d`) |
| `DATA_DIR` | no | Folder for `data.json` (use a persistent volume in prod) |
| `CORS_ORIGIN` | no | Only if hosting the frontend on a different domain |

Frontend (`frontend/.env`) — all optional:

| Var | Purpose |
| --- | --- |
| `VITE_API_URL` | Override API base. Leave unset for same-origin `/api` in prod. |

## Keys / resources needed
None to start. Payment QRs are generated on-device from the shopkeeper's own
UPI ID (entered at registration or in Settings). If you later want
server-verified payments (auto "paid" confirmation), that needs a
payment-gateway account (Razorpay/Cashfree) — not required for this build.
