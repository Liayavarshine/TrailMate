# TrailMate — Tourist / Tour Guide Management System

A complete, working full-stack tourism booking platform: browse real Indian tour
packages, get guide recommendations based on language + rating + experience, book,
pay (mock gateway, ₹ INR), and review guides after a completed trip. Admin, Tourist,
and Guide dashboards are all fully functional against a real PostgreSQL database.

This is a **modification** of the earlier JSON-file version of this project — same
Express skeleton and route-file layout, now backed by PostgreSQL with a Tour Package
system layered on top.

## What changed in this version

| Area | Before | Now |
|---|---|---|
| Database | `data/db.json` (flat file) | **PostgreSQL** (`schema.sql`, `db.js` uses `pg`) |
| Core entity | Book a guide directly | **Book a Tour Package** (Ooty, Munnar, Goa, Kerala, Jaipur, Manali, Rishikesh, Andaman, Coorg, Varanasi, Udaipur, Darjeeling — 12 seeded) |
| Guides | One guide per booking, no matching | **Multiple guides per package** (`package_guides`), with a **recommendation score** = language match + rating + experience |
| Tourist | No preferences | **Language preferences**, set at registration, used to rank recommended guides |
| Reviews | Any paid booking | Only **after `completed`** status, **1 review per booking** (DB-level `UNIQUE` constraint + app check), auto-recomputes guide **and** package rating rollups in a transaction |
| Currency | USD (`$`) | **INR (`₹`) only**, formatted with `en-IN` grouping |
| Frontend | Guide-search dashboard | Full travel-platform UI: hero search, package grid with filters/sort, package detail page with itinerary + guide picker + live price summary, star-rating review modal, admin package CRUD |
| UX states | None | Skeleton/spinner loading, retryable error banners, empty states everywhere |

## Stack
- **Backend:** Node.js + Express, `pg` (node-postgres), JWT auth, bcrypt
- **Database:** PostgreSQL (see `schema.sql`)
- **Frontend:** Plain HTML/CSS/JavaScript, no build step, no framework

## Project structure
```
tourist-booking-system/
├── server.js                # Express entry point
├── db.js                    # PostgreSQL pool (pg) — every route goes through this
├── schema.sql                # Full DDL: users, packages, package_guides, bookings, payments, reviews, documents
├── migrate.js                 # Applies schema.sql to DATABASE_URL  →  npm run migrate
├── seed.js                    # Demo data: 12 packages, 16 guides, 2 tourists, 1 admin  →  npm run seed
├── middleware/auth.js         # JWT verify + role guard (unchanged)
├── routes/
│   ├── auth.js                 # register (incl. language prefs), login
│   ├── packages.js             # NEW — list/search/filter, detail, guide recommendations, admin CRUD
│   ├── guides.js                # guide directory, profile, self-update
│   ├── bookings.js              # package → date → tourists → guide → price → confirm
│   ├── payments.js              # mock gateway, ₹ INR
│   ├── reviews.js               # 1–5 stars, post-completion only, rating rollups
│   ├── documents.js             # guide verification document upload
│   └── admin.js                 # users, packages, bookings, documents, reports
└── public/
    ├── index.html                # login / register (+ tourist language checkboxes)
    ├── packages.html + js/packages.js         # browse / search / filter tour packages
    ├── package-detail.html + js/package-detail.js  # itinerary, guide recommendations, booking + payment
    ├── tourist.html + js/tourist.js           # My Bookings + star-rating review modal
    ├── guide.html + js/guide.js               # profile, documents, assigned packages, bookings, reviews
    ├── admin.html + js/admin.js               # reports, package CRUD, doc verification, users, bookings
    ├── css/style.css                          # shared design system
    └── js/api.js                              # fetch wrapper, ₹ formatting, star rendering, loading/error helper
```

## Setup

### 1. PostgreSQL
Install and start PostgreSQL, then create a database and user:
```sql
CREATE USER tbs_app WITH PASSWORD 'your_password';
CREATE DATABASE tourist_booking OWNER tbs_app;
```

### 2. Environment variables
Copy `.env.example` to `.env` and fill in your real values:
```
DATABASE_URL=postgresql://tbs_app:your_password@localhost:5432/tourist_booking
JWT_SECRET=change-this-to-a-long-random-string
PORT=3000
```

### 3. Install, migrate, seed, run
```bash
npm install
npm run migrate   # applies schema.sql — creates all tables
npm run seed       # loads 12 packages, 16 guides, 2 tourists, 1 admin
npm start
```
Open **http://localhost:3000**.

> **Note on package photos:** `npm run seed` tries to fetch a real photo for each
> destination from Wikipedia's public API at seed time, falling back to a generic
> placeholder only if that request fails (e.g. no internet access, or a restricted
> network). With normal internet access this gives every package a real, relevant photo.

## Demo accounts

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | admin@tourbook.com | admin123 | Manage packages, users, docs, reports |
| Tourist | priya@tourist.com | tourist123 | Prefers English, Hindi |
| Tourist | arun@tourist.com | tourist123 | Prefers English, Tamil |
| Guide | asha@guides.com | guide123 | Verified, has 1 review, leads Ooty/Munnar/Coorg |
| Guide | divya@guides.com | guide123 | Pending document verification |
| ...14 more guides | `<firstname>@guides.com` | guide123 | See `GUIDE_DEFS` in `seed.js` |

You can also register new tourist/guide accounts from the login page.

## End-to-end flow to try

1. **Log in as Priya (tourist).** You land on **Browse Packages** — search "Kerala",
   filter by category, sort by price.
2. Open **Munnar Tea Garden Escape** → see the itinerary, and the **guide list is
   ranked** with a "★ Recommended" badge on the guide whose languages best match
   Priya's preferences (English, Hindi) combined with rating and experience — but
   any available guide can still be picked.
3. Pick a date, set travellers, confirm — this creates the booking **and**
   immediately settles the mock payment (₹ shown throughout), landing you on
   **My Bookings** with status `confirmed`.
4. **Log in as the assigned guide** → **Guide Dashboard** → find the booking under
   "My bookings" → **Mark completed**.
5. **Log back in as Priya** → **My Bookings** → the completed trip now shows
   **Rate & review** → submit 1–5 stars + a comment. Try submitting again: blocked
   (already reviewed). Try reviewing a `pending`/`confirmed` booking: blocked
   (tour not completed yet).
6. **Log in as Admin** → **Reports** shows updated revenue/rating; **Tour packages**
   lets you add a brand-new package with itinerary and assign guides to it; **Verify
   documents** approves/rejects a guide's pending document.

## API overview

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /api/auth/register | public | Create tourist/guide account (tourist can set `languagePrefs`) |
| POST | /api/auth/login | public | Log in, get JWT |
| GET | /api/packages?search=&category=&state=&minPrice=&maxPrice=&sort= | public | Browse/search/filter packages |
| GET | /api/packages/meta/filters | public | Distinct categories/states for filter dropdowns |
| GET | /api/packages/:id | public | Package detail + itinerary + reviews |
| GET | /api/packages/:id/guides?lang=English,Hindi | auth | **Guide recommendations** for this package (advisory, sorted by score) |
| POST | /api/packages | admin | Create a package (+ optional `guideIds`) |
| PUT | /api/packages/:id | admin | Edit a package |
| PUT | /api/packages/:id/guides | admin | Set the full guide roster for a package |
| GET | /api/guides?search= | public | Guide directory |
| GET | /api/guides/:id | public | Guide profile + reviews + packages led |
| PUT | /api/guides/me | guide | Update own profile (bio, languages, experience, availability) |
| POST | /api/bookings | tourist | package → date → tourists → guide → price → booking |
| GET | /api/bookings/mine | tourist | My bookings (+ `hasReview` flag) |
| GET | /api/bookings/received | guide | Bookings assigned to me |
| PUT | /api/bookings/:id/status | tourist/guide/admin | `cancelled` (tourist/admin) or `completed` (guide/admin) |
| POST | /api/payments | tourist | Settle a pending booking (mock gateway, ₹) |
| POST | /api/reviews | tourist | 1–5 stars, only post-completion, no duplicates |
| GET | /api/reviews/guide/:id | public | Reviews for a guide |
| POST /GET | /api/documents | guide | Upload / list verification documents |
| GET | /api/admin/* | admin | users, packages, bookings, documents, reports |

## Booking status lifecycle
`pending → confirmed (payment settled) → completed (guide/admin marks it)`
or `pending`/`confirmed → cancelled` (tourist/admin)

Reviews are only accepted once a booking reaches `completed`, and each booking can
be reviewed exactly once (enforced both in the API and with a `UNIQUE` constraint
on `reviews.booking_id`).

## Guide recommendation algorithm
For a given package and the tourist's language preferences, each assigned guide is scored:
```
score = (language_matches × 3) + (avg_rating × 1.2) + (min(experience_years, 10) / 10 × 2)
```
The highest-scoring **available** guide is flagged `recommended: true` in the API
response — the frontend highlights this guide but the tourist is free to pick anyone.

## Notes for going further
- **Real payments:** `routes/payments.js` has a clearly marked mock gateway block —
  swap it for Razorpay/Stripe/PayU without touching any other file.
- **Verification documents:** guide uploads accept PDF files only; the document type, original filename, and PDF bytes are stored in PostgreSQL
  only; add `multer` + disk/S3 storage if you need actual file uploads.
- **Production DB:** point `DATABASE_URL` at a managed Postgres (Render, Railway,
  Supabase, Neon, RDS) — no code changes needed, just re-run `npm run migrate`.
