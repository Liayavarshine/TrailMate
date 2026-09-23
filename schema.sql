-- schema.sql — Tourist / Tour Guide Management System
-- Run via `npm run migrate` (executes this file against DATABASE_URL).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / DROP...CREATE).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid if ever needed

-- ============================================================
-- USERS  (admin / tourist / guide — single table, role-based)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(120) NOT NULL,
  email            VARCHAR(160) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  phone            VARCHAR(30) DEFAULT '',
  role             VARCHAR(20) NOT NULL CHECK (role IN ('admin','tourist','guide')),
  status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),

  -- tourist-only
  language_prefs   TEXT[] DEFAULT '{}',

  -- guide-only
  bio              TEXT DEFAULT '',
  languages        TEXT[] DEFAULT '{}',
  experience_years NUMERIC(4,1) DEFAULT 0,
  availability     BOOLEAN DEFAULT TRUE,
  avg_rating       NUMERIC(3,2),
  review_count     INTEGER NOT NULL DEFAULT 0,
  completed_tours  INTEGER NOT NULL DEFAULT 0,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- PACKAGES  (tour packages: Ooty, Munnar, Goa, Kerala, Jaipur ...)
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
  id               SERIAL PRIMARY KEY,
  title            VARCHAR(160) NOT NULL,
  destination      VARCHAR(120) NOT NULL,
  state            VARCHAR(80)  NOT NULL,
  category         VARCHAR(40)  NOT NULL,        -- Hill Station, Beach, Heritage, Backwaters, Adventure, Spiritual
  description      TEXT NOT NULL,
  itinerary        JSONB NOT NULL DEFAULT '[]',  -- [{ day: 1, title, details }, ...]
  duration_days    INTEGER NOT NULL,
  price_inr        NUMERIC(10,2) NOT NULL,       -- per person, INR only
  max_group_size   INTEGER NOT NULL DEFAULT 10,
  image_url        TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  avg_rating       NUMERIC(3,2),
  review_count     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_packages_destination ON packages(destination);
CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);

-- ============================================================
-- PACKAGE_GUIDES  (many-to-many: a package can have several guides)
-- ============================================================
CREATE TABLE IF NOT EXISTS package_guides (
  package_id  INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  guide_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, guide_id)
);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id               SERIAL PRIMARY KEY,
  tourist_id       INTEGER NOT NULL REFERENCES users(id),
  package_id       INTEGER NOT NULL REFERENCES packages(id),
  guide_id         INTEGER REFERENCES users(id),
  tour_date        DATE NOT NULL,
  num_tourists     INTEGER NOT NULL DEFAULT 1 CHECK (num_tourists > 0),
  total_price_inr  NUMERIC(10,2) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_tourist ON bookings(tourist_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guide ON bookings(guide_id);
CREATE INDEX IF NOT EXISTS idx_bookings_package ON bookings(package_id);

-- ============================================================
-- GUIDE PAYOUT CLAIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_claims (
  id             SERIAL PRIMARY KEY,
  booking_id     INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  guide_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_inr     NUMERIC(10,2) NOT NULL CHECK (amount_inr >= 0),
  transaction_id VARCHAR(80) NOT NULL,
  claimed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_claims_guide ON payout_claims(guide_id);
ALTER TABLE payout_claims DROP CONSTRAINT IF EXISTS payout_claims_transaction_id_key;

-- ============================================================
-- PAYMENTS  (mock gateway, INR)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id               SERIAL PRIMARY KEY,
  booking_id       INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_inr       NUMERIC(10,2) NOT NULL,
  method           VARCHAR(30) NOT NULL DEFAULT 'card',
  status           VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed')),
  transaction_id   VARCHAR(60) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- REVIEWS  (tourist rates the guide after a completed booking)
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  booking_id   INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  tourist_id   INTEGER NOT NULL REFERENCES users(id),
  guide_id     INTEGER NOT NULL REFERENCES users(id),
  package_id   INTEGER NOT NULL REFERENCES packages(id),
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_guide ON reviews(guide_id);
CREATE INDEX IF NOT EXISTS idx_reviews_package ON reviews(package_id);

-- ============================================================
-- DOCUMENTS  (guide verification documents)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id           SERIAL PRIMARY KEY,
  guide_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(80) NOT NULL,
  filename     VARCHAR(160) NOT NULL,
  content      BYTEA,
  mime_type    VARCHAR(100) DEFAULT 'application/pdf',
  file_size    INTEGER DEFAULT 0,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  upload_date  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100) DEFAULT 'application/pdf';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT 0;

