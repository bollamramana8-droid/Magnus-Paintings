MAGNUS PAINTINGS — REAL WEBSITE STARTER

This package is a runnable Node.js backend + frontend starter, not just a static mockup.

BOSS LOGIN
- A separate /api/boss/login endpoint and Boss Dashboard are included.
- Boss password for this local/demo build: 2008. It is NOT stored in plaintext; a PBKDF2-SHA256 hash is used in .env.
- Change SESSION_SECRET before deployment.
- Never commit .env.

BUYER/SELLER
- Basic account registration/login and session cookies are included.
- Production Google/Facebook/phone OTP should be added through a proper identity provider.
- Seller onboarding, identity verification and payout details still need production integration.

PAINTINGS
- Boss can add a painting with a protected preview and a clean original.
- Public painting list shows approved listings.
- Keep originals private in production.

ORDERS / 2% FEE
- Order creation calculates a 2% platform fee and seller amount.
- Payment is intentionally NOT marked paid until a real payment-provider webhook verifies payment.
- Actual automatic seller payouts require a marketplace-capable payment provider and compliant business/KYC/tax setup.

SECURE ORIGINALS
- The endpoint checks buyer + paid order before original delivery.
- Production should store originals in private object storage and return a short-lived signed URL after authorization.
- Do not put clean originals in public HTML/JS.

HOW TO RUN
1. Install Node.js 20+.
2. A demo .env is already included for local testing. For production, replace it with your own secrets.
3. Set a strong SESSION_SECRET.
4. npm install
5. npm start
6. Open http://localhost:3000

IMPORTANT BEFORE PUBLIC LAUNCH
- Replace demo buyer password storage with Argon2id/bcrypt.
- Add CSRF protection and rate limiting.
- Add HTTPS/secure cookies.
- Add real payment gateway + webhook verification.
- Add KYC/seller payout onboarding.
- Add private object storage for originals.
- Add Google/Facebook/phone OTP authentication.
- Add production database/backups.
- Add legal pages: Terms, Privacy, Refund, Copyright/IP, Seller Agreement.
- Configure your real domain, DNS, Search Console and sitemap.
