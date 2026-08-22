# Email identity & recovery — design

Date: 2026-08-22 · Status: APPROVED (David, in-chat) · Implements the ROADMAP P1
"email milestone" + pulls TOTP 2FA forward from P2.

## Problem

Accounts are username+password only. A cloud customer who forgets their
password loses their reef until manual VM surgery (audit F2) — unacceptable for
a paid product. Claim links live only on-screen + Stripe metadata. No dunning
warning before a reef suspends.

## Decisions (David, 2026-08-22)

- **Email required at signup — everywhere.** Cloud: required and verified.
  Self-host: required as an identity field; verification only when the instance
  has SMTP configured (a homelab without a mail server stays fully usable).
- **No phone numbers, ever** (SMS cost, toll fraud, support tax; TOTP 2FA is
  the future security upgrade, already on the roadmap).
- Sign-in accepts **username OR email**.

## Architecture

### 1. Mailer service (`server/src/services/email.ts`)

- `Mailer` interface (like `StripeGateway`): `send({to, subject, text, html})`.
  Real impl: nodemailer over SMTP from env (`NEMOMEMO_SMTP_HOST/PORT/USER/PASS`
  + `NEMOMEMO_SMTP_FROM`). `emailEnabled(config)` = all vars set.
- Tests use a recording fake — no network, assert exact messages.
- Reef-voice templates (plain text first, minimal HTML): verify-email,
  password-reset, claim-link, payment-failed.
- Cloud: ONE platform SMTP account in `cloud.env`; the supervisor passes mailer
  config into each reef's app config (tenant app stays cloud-unaware — it just
  sees SMTP env like any self-host).

### 2. Data (migration 0004 — additive, no rebuilds)

- `user.email_verified_ts` INTEGER NULL (ALTER TABLE ADD COLUMN).
- New `auth_token` table: id, user_id (FK cascade), purpose
  CHECK('EMAIL_VERIFY','PASSWORD_RESET'), token_hash (sha256, like sessions),
  created_ts, expires_ts, used_ts NULL. Single-use, short-lived (verify 7d,
  reset 1h).
- Email uniqueness enforced at the app layer (case-insensitive check on
  signup/account-update), NOT a DB unique index — existing rows may hold dupes
  and reefs are ≤25 members. Sign-in-by-email requires a unique match.

### 3. Signup & sign-in

- `signupRequestSchema` gains required `email` (validated, trimmed,
  lowercased). Claim form gains an email field, **prefilled from Stripe** (the
  customer already gave it at checkout; gateway grows `getCustomerEmail`).
- Sign-in: try username, else unique email match. Same dummy-hash timing guard.
- Existing users keep working; signed-in users without an email see a
  dismissible banner: "Add your email so your account can be rescued" (shown
  when instance has SMTP or is cloud).

### 4. Verification (cloud strict, self-host flexible)

- On signup/email-change where email is enabled: send verify link
  (`/auth/verify?token=`), set `email_verified_ts` on success.
- Cloud: persistent (non-blocking) banner until verified. No hard lockout in
  v1 — possession of the inbox is proven the first time any reset is used.
- Self-host without SMTP: no verification flow exists; email is just identity.

### 5. Password reset (the payoff — audit F2)

- `POST /auth/forgot` (rate-limited 5/hr/IP, always returns 200 — no account
  enumeration) → email a 1-hour single-use link → `/auth/reset?token=` page →
  new password (min 8), all sessions for that user revoked, sign in fresh.
- Self-host without SMTP: page says "ask your reefkeeper" (admin reset already
  exists in Settings → Members).

### 6. Cloud lifecycle emails (webhook-driven, cloud router only)

- Provisioning: claim link emailed to the Stripe customer (kills the
  on-screen-only claim problem). Claim success: welcome email with reef URL.
- `invoice.payment_failed`: "your payment didn't make it through" dunning email
  before suspension.

## Ship-dark & testing

- Tenant behavior changes (email at signup) apply to BOTH distributions by
  design — this is a product change, not a cloud leak; `cloud-isolation.test.ts`
  extended (per-reef mailer isolation: reef A's verify mail never sends from
  reef B's context).
- New `email.test.ts` (fake mailer): verify flow, reset flow end-to-end incl.
  token expiry/reuse, enumeration-safety, no-SMTP degradation. TDD throughout.

### 7. TOTP 2FA (opt-in for everyone — David, 2026-08-22)

- Authenticator-app TOTP only (no SMS, consistent with no-phones). Enrollment in
  Settings: QR code (otpauth:// URI) + manual secret + 10 single-use backup
  codes (hashed at rest). Sign-in: after password success, users with 2FA get a
  six-digit challenge (or a backup code). Disable requires a current code.
- Data: `user.totp_secret` (encrypted-at-rest is overkill for SQLite-on-disk
  threat model; store raw like password hashes' peer) + `backup_code` rows
  (hashed). Ships AFTER password reset exists (lockout recovery path first).
- No per-reef enforcement switch in v1; "require for reefkeepers" is a possible
  later instance setting.

## Rollout (three releases)

1. **v1.8.0 — identity**: mailer service, migration 0004, email-required
   signup + claim email field, sign-in-by-email, verification, add-email
   banner, `emailEnabled` in the instance profile. David already has Brevo —
   creds (`NEMOMEMO_SMTP_*`) go into cloud.env + VM restart when ready; the
   feature ships dark until the env vars exist.
2. **v1.9.0 — recovery & lifecycle**: password reset, claim-link email via
   Stripe address, welcome email, dunning email.
3. **v1.10.0 — 2FA**: TOTP enrollment/challenge/backup codes per section 7.

## Out of scope

Phone/SMS anything; email-change re-verification flows beyond re-sending;
weekly digests and email-in capture (separate roadmap items, post-SMTP); TOTP
2FA (own item); marketing email of any kind.
