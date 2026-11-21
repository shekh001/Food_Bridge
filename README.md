# FoodBridge — Real-Time Surplus Food Redistribution Platform

A two-sided marketplace that connects food donors (restaurants, hotels, caterers,
grocery stores) with recipient organizations (shelters, NGOs, community kitchens)
in real time — matched by proximity, urgency (time-to-expiry), and quantity fit.

Built for the K.R. Mangalam University SOET **Industry-Based Project** category.

---

## Tech stack
- **Frontend:** React 18 (Vite), React Router, Tailwind CSS, Socket.io-client
- **Backend:** Node.js, Express, MongoDB (Mongoose), Socket.io, JWT auth, PDFKit
- **Real-time:** Socket.io rooms (per-user + per-role notifications)
- **Live GPS tracking:** claimant broadcasts device location via `navigator.geolocation.watchPosition` while status is `claimed`/`picked_up`; donor sees a moving marker on a Leaflet map (`LiveTrackingMap.jsx` + `ShareLocationToggle.jsx`), throttled to one update per 4s both client- and server-side
- **Matching engine:** custom scoring algorithm (haversine distance + urgency decay + quantity fit)
- **Resilience:** helmet (security headers), rate limiting on auth routes, global crash handlers,
  a React error boundary + backend log beacon for frontend crashes, optional Sentry integration

## Project structure
```
foodbridge/
├── backend/            Express API (MongoDB, JWT, Socket.io, matching engine, PDF certificates)
│   └── src/
│       ├── config/      DB connection
│       ├── models/      User, FoodListing
│       ├── controllers/ auth, listing, admin, impact, certificate
│       ├── routes/
│       ├── middleware/  JWT auth + role guard
│       ├── sockets/     real-time notification rooms
│       ├── utils/       matching engine (distance / urgency / quantity scoring)
│       └── seed.js      demo data (donors, NGOs, listings)
└── frontend/           React app (Vite + Tailwind)
    └── src/
        ├── pages/        Landing, Login, Register, Browse, Impact, dashboards
        ├── components/   Navbar, ListingCard, RescueRail (status pipeline), StatCounter
        ├── context/      Auth + Socket providers
        └── api/          Axios client
```

## Running it locally in VS Code

**Prerequisites:** [VS Code](https://code.visualstudio.com), [Node.js 18+](https://nodejs.org),
and either a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster or Docker
(`docker run -d -p 27017:27017 --name foodbridge-mongo mongo`).

1. **Open the folder.** Unzip this project, then `File → Open Folder…` and select the
   `foodbridge/` root (not `backend/` or `frontend/` individually — the workspace has both).
2. **Install recommended extensions.** VS Code will prompt you (`.vscode/extensions.json`
   is included) — accept it. ESLint + Prettier + Tailwind IntelliSense make the codebase
   much easier to navigate.
3. **Set up the backend:**
   ```bash
   cd backend
   cp .env.example .env
   ```
   Open the new `.env` and fill in `MONGO_URI` (your Atlas connection string, or
   `mongodb://127.0.0.1:27017/foodbridge` if using the Docker command above) and set
   `JWT_SECRET` to any long random string. Leave `RAZORPAY_*`, `VAPID_*`, and `SENTRY_DSN`
   blank for now — every feature that needs them degrades gracefully into a labeled demo
   mode without them.
   ```bash
   npm install
   npm run seed      # loads demo donors, NGOs, and listings
   npm run dev        # http://localhost:5000 — auto-restarts on file changes
   ```
4. **Set up the frontend** (open a **second terminal** — `` Ctrl+Shift+` `` in VS Code,
   then the `+` icon to split, so backend keeps running):
   ```bash
   cd frontend
   cp .env.example .env    # VITE_API_URL should already point at localhost:5000/api
   npm install
   npm run dev               # http://localhost:5173
   ```
5. **Open the app** — `http://localhost:5173` in your browser, log in with a demo account
   below, and click around. Both terminals will print live logs as you use the app, which
   is the fastest way to see what's happening under the hood.

**Debugging with breakpoints:** open the Run & Debug panel (`Ctrl+Shift+D`), pick
**"Backend: Debug server"** from the dropdown (already configured in `.vscode/launch.json`),
and hit ▶. Click in the left margin of any backend file to set a breakpoint — execution
will pause there on the next matching request.

### Demo logins (after `npm run seed`)
| Role  | Email                     | Password     |
|-------|---------------------------|--------------|
| Admin | admin@foodbridge.app      | password123  |
| Donor | donor1@foodbridge.app     | password123  |
| NGO   | ngo1@foodbridge.app       | password123  |

### Creating your real admin account (production)
`npm run seed` is a **demo** tool — it wipes the database and uses a well-known
password, so never run it against production. To bootstrap the first real admin:
```bash
cd backend
npm run create-admin
```
It asks for an email, org name, and a password (masked while typing, and rejected if
it's weak or a known default). It refuses to run if that email is already registered,
so it's safe to leave in your deploy pipeline. Once you have one admin, add any further
admins from inside the app (Admin Dashboard → Promote to admin) — the script is only
for the initial chicken-and-egg bootstrap.

## Testing

**Automated (backend):**
```bash
cd backend
npm run test          # 158 tests — matching engine, auth/RBAC, reviews, predictions, billing, disputes/appeals, listing photos, courier bookings, cloud storage, needs board
```
No live database needed — these mock Mongoose, so they run the same on your machine, in CI,
or here. In VS Code, use **"Backend: Debug tests"** from the Run & Debug dropdown to step
through a failing test with breakpoints instead of reading stack traces.

**Manual (full flow, both servers running):** open `api-smoke-tests.http` in VS Code (install
the **REST Client** extension if you don't have it — it's in the recommended list) and click
"Send Request" above each block, top to bottom. It walks through: login → post a listing →
claim it → mark picked up → mark delivered → download a certificate → check billing status —
the exact same path a real donor and NGO would take, just via API calls instead of clicking
through the UI. This is the fastest way to confirm a change didn't break the core flow
before doing it by hand in the browser.

**Manual (in the browser):** log in as `donor1@foodbridge.app` in one browser and
`ngo1@foodbridge.app` in an incognito window side by side — post a listing as the donor,
watch it appear in real time on the NGO's screen (no refresh needed), claim it, and walk
both accounts through the status pipeline. This is the single best way to catch anything
the automated tests wouldn't (timing issues, real-time updates, how it actually feels to use).

## Dependency security

`npm audit` is checked periodically as part of development, not just at initial setup:
- **Fixed**: `nodemailer` was upgraded off a version range with several high-severity advisories
  (SMTP command injection, SSRF via file/URL-access bypass) — the upgrade only touched
  `utils/email.js`'s internals, the public API used there (`createTransport`/`sendMail`) is
  unchanged.
- **Fixed**: `cloudinary` was upgraded off v1.x, which has a high-severity argument-injection
  advisory with no patched release on that major version. The blocker was `multer-storage-cloudinary`,
  which pins a hard peer dependency on `cloudinary@^1.x` and has no newer release supporting v2 —
  so `middleware/upload.js` now talks to Cloudinary directly via `uploader.upload_stream()` (a
  small, self-contained storage engine implementing multer's `_handleFile`/`_removeFile`
  interface) instead of going through that package at all.
- **Known, left as-is**: `@opentelemetry/core` (moderate, pulled in transitively by the optional
  Sentry SDK — dormant unless `SENTRY_DSN` is set) and `react-router-dom` (moderate — the fix
  requires a v6→v7 major upgrade; both flagged CVEs need a code pattern this app doesn't use:
  one needs server-side rendering, which this SPA never does, the other needs a user-controlled
  redirect target, which no `navigate()`/`<Link>` call here ever passes). Re-check
  `npm audit --production` in both `backend/` and `frontend/` occasionally in case a real fix
  ships later.

## How you'll know if something breaks (once it's live)

A deployed app fails silently unless something is watching it. Three layers, cheapest first:

1. **Server logs (free, already on).** Every error — backend crash, DB hiccup, or a frontend
   crash reported via the built-in `/api/client-error` beacon — is logged with a full stack
   trace. On Render: your service → **Logs** tab. Check this first when something seems off.
2. **Uptime alerts (free, 5-minute setup, no code).** [UptimeRobot](https://uptimerobot.com) —
   add a free "HTTP(s)" monitor pointed at `https://your-backend.onrender.com/api/health`,
   checked every 5 minutes. If it stops returning `200`, UptimeRobot emails (or texts) you
   within minutes — you find out from an alert, not from a user complaining.
3. **Structured error tracking (free tier, optional).** Set `SENTRY_DSN` in the backend's
   `.env` (sign up free at [sentry.io](https://sentry.io) → New Project → Node.js → copy the
   DSN) and every error — backend or frontend — gets a stack trace, a count of how often it's
   happening, and an email alert, all in one dashboard. Worth turning on once real users are
   on the platform; unnecessary for a solo local demo.


## Core features
- Donor posts surplus food (type, quantity, expiry window, pickup location, and an optional photo of the food itself)
- Matching engine ranks verified NGOs by **distance + urgency + quantity fit**, notifies top matches in real time via Socket.io
- NGO claims a listing; both sides track it through **posted → claimed → picked up → delivered**
- On delivery, the donor can download an auto-generated **PDF donation certificate** for CSR / tax reporting — the platform's core monetization hook
- Public impact dashboard: meals saved, kg diverted, CO2e avoided
- **Dispute system**: either party on a listing can file a report (with optional photo/document evidence) about the other; admin reviews it and can dismiss, warn, or suspend — the reporter is notified either way, not just the person reported, and admins see a "reported N times before" flag so repeat offenders don't look like isolated first-time incidents
- **Suspension appeals**: a suspended account can't log in to reach any authenticated route, so the appeal form is reachable straight from the login screen by email alone — an admin reinstates or upholds it from a dedicated queue
- Landing page shows a live-scrolling strip of real recent deliveries (org names, food type, quantity — no PII), backed by a public `GET /api/impact/recent-activity` endpoint
- **Pickup courier booking**: an NGO without transport can pay a small fee to have a (simulated) courier collect a claimed listing — the donor sees the courier's ETA on their own dashboard
- **Needs board**: an NGO can post what it's actually short on (food type, quantity, deadline) instead of only ever reacting to whatever surplus shows up — donors browse open needs and can respond directly, which auto-marks the need fulfilled and links back to their listing
- Admin console: NGO verification (with NGO-Darpan registration ID shown as a trust signal), dispute/stuck-delivery visibility
- **In-app chat** scoped to each claimed listing, for pickup coordination (real-time, Socket.io)
- **Ratings & reviews** — donor and NGO rate each other after delivery; feeds into each org's public reputation score
- **Browser push notifications** — new matches, claims, and status updates reach users even when the tab is closed (optional, needs VAPID keys — see below)
- **Multi-stop route optimization** — NGOs with 2+ pending pickups get the shortest-total-time visiting order, via OSRM's free public trip service (no API key, no billing)
- **Demand hotspot prediction** — a transparent heuristic (not a trained model) that surfaces which location/day/time combos have historically produced the most surplus, from aggregated past listings

## Enabling push notifications (optional)
Push is silently disabled unless `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are set. To enable:
```bash
cd backend
npx web-push generate-vapid-keys
```
Paste the printed keys into `backend/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). No frontend
config needed — the app fetches the public key from `/api/push/public-key` automatically.

## Monetization
Two independent revenue streams, both implemented end-to-end (not just UI mockups) — each with a
real/live path via Razorpay and a demo/simulated path that runs out of the box with no payment
gateway credentials at all.

### 1. CSR Pro tier — subscription
- **Free forever**: single-donation certificate (the trust-building hook — never gated)
- **Pro (₹999/mo)**: consolidated, itemized CSR report across all donations in a date range —
  what a corporate tax/CSR team actually files
- See `backend/src/controllers/billingController.js` and `frontend/src/components/UpgradeCard.jsx`.

### 2. Pickup courier booking — transaction fee
- An NGO that claimed a listing but has no volunteer/transport available can pay a flat **₹35
  convenience fee** to have a (simulated) courier collect it instead of the pickup stalling out.
- The donor gets read-only visibility into the courier's name/phone/ETA on their own dashboard —
  transparency without either side having to coordinate manually.
- The NGO can cancel a booking any time before pickup (own transport showed up after all, etc) —
  and if the listing itself gets cancelled by the donor or the claim gets released, any active
  courier booking on it is automatically cancelled and refunded too, so a paid booking never sits
  orphaned blocking future bookings on that listing.
- Marking a listing "picked up" automatically syncs the courier booking's own status too — one
  action, not a separate manual confirmation step. In live Razorpay mode, if the listing became
  unbookable in the few seconds between checkout opening and the payment landing (donor cancelled
  it, someone else booked first), the payment that already went through gets refunded
  automatically rather than silently keeping the fee with no booking to show for it.
- If a refund itself ever fails (a real Razorpay error, not the demo-mode no-op), it shows up in
  the admin console's "Courier refund issues" section with a one-click retry — the actual
  follow-up path behind the "our team will follow up" message an NGO sees, so that's a keepable
  promise instead of a dead end nobody can act on.
- Both dashboards re-sync from the server on every real-time notification (claim, release, status
  change, courier update) — not just the party that took the action, so a donor's screen reflects
  an NGO releasing a claim (and vice versa) without a manual page reload.
- There's no real delivery-partner API behind this (that would need a live courier-network
  contract) — the *payment* can be real Razorpay, the *dispatch* is always simulated, clearly
  labeled as such in the API response and the UI, exactly like the Pro-tier demo mode above.
- See `backend/src/controllers/courierController.js`, `frontend/src/components/CourierBookingCard.jsx`,
  and `CourierStatusBadge.jsx`.

Both features share one Razorpay setup:
- **No live keys = demo/simulated payment** (clearly labeled in the UI, no real money moves) —
  this is what a fresh clone runs in by default. Add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`
  (free TEST-mode keys, no business KYC needed) to `backend/.env` to switch both flows to real
  Razorpay Checkout with server-side signature verification.

## Other monetization paths (roadmap, not yet built)
- Freemium tiers for NGOs (priority alerts, multi-branch accounts)
- Logistics/volunteer coordination commission per completed pickup
- B2B API access for large restaurant chains once there's real integration demand

## Deploying for real use (step by step)

**1. Database — MongoDB Atlas (free tier)**
1. Create an account at [mongodb.com/atlas](https://www.mongodb.com/atlas) → build a free M0 cluster.
2. Database Access → add a user + password. Network Access → allow `0.0.0.0/0` (or Render's IPs).
3. Copy the connection string — this is your `MONGO_URI`.

**2. Backend — Render**
1. Push this repo to GitHub.
2. New → Web Service on [render.com](https://render.com), point it at the repo (`render.yaml` in
   `backend/` auto-configures build/start commands and env var slots).
3. Fill in `MONGO_URI` (from step 1) and `CLIENT_URL` (your Vercel URL from step 3, can update after).
4. Deploy — you'll get a URL like `https://foodbridge-api.onrender.com`.

**3. Frontend — Vercel**
1. New Project on [vercel.com](https://vercel.com), point it at the repo, root directory `frontend/`.
2. Add env var `VITE_API_URL` = your Render backend URL from step 2.
3. Deploy — you'll get a URL like `https://foodbridge.vercel.app`.
4. Go back to Render and update `CLIENT_URL` to this Vercel URL (needed for CORS + Socket.io).

**4. Seed demo data (optional, for live demo)**
Run `npm run seed` once, locally, pointed at the Atlas `MONGO_URI` (set it in your local `.env`)
so the live deployment has demo donors/NGOs/listings to show.

Free-tier note: Render's free web services sleep after inactivity — the first request after
a while takes ~30s to wake up. Fine for a college demo, mention it if presenting live.

**5. Before real (non-demo) users rely on this**
- **File storage now supports Cloudinary** — set `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET` (free forever tier, no credit card, at cloudinary.com) and verification
  docs, report evidence, and listing photos all upload there instead of local disk, surviving
  redeploys and host restarts. Leave these unset and everything still works exactly as before —
  local disk, same as a fresh clone always did — which is why local dev needs zero setup either
  way. Verification docs and report evidence upload as Cloudinary's `authenticated` (signed-URL)
  type since they're sensitive; listing photos upload as plain public images since a photo of
  surplus food isn't. If you'd rather use Render's persistent disk add-on instead (simplest,
  ~$1/mo for 1GB, zero code changes — Render dashboard → your service → Disks), that still works
  too; the two aren't mutually exclusive, just redundant with each other.
- **`EMAIL_HOST`/`EMAIL_USER`/`EMAIL_PASS` unset means "forgot password" hands the reset link
  straight back in the response instead of emailing it** (clearly labeled as demo mode) — fine for
  testing, but a real user who forgets their password won't get an email. Set these (a free
  Gmail app-password or Resend/SendGrid free tier both work) before real users sign up.
- `app.set('trust proxy', 1)` is already set in `server.js` so rate-limiting reads the real client
  IP behind Render's proxy instead of rate-limiting everyone together — nothing to do here, just
  don't remove it if you ever touch that file.
