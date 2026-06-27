# FairShare

A full-stack TypeScript application for splitting household expenses in
proportion to each person's income. It tracks who initially paid each expense
and calculates the final payment required to settle the period.

## Features

- Custom monthly or multi-month calculation periods
- Income-weighted expense allocation
- Expense tracking by payer, date, and category
- Exact whole-yen calculations with deterministic remainder allocation
- Two-user authentication with database-backed sessions
- Period closing and historical summaries
- Responsive interface built with Tailwind CSS

## Technology

- Vue 3, Vite, Vue Router, and Tailwind CSS
- Node.js, Express, and TypeScript
- MySQL or MariaDB
- Strict TypeScript checking and Node's built-in test runner
- Secure HTTP-only session cookies, password hashing, rate limiting, and
  security headers

## Local setup

1. Install Node.js 24 and MySQL 8 or MariaDB 10.6+.
2. Copy `.env.example` to `.env` and set the database and initial-user values.
3. Create the empty database named in `DB_NAME`.
4. Run:

   ```sh
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

The Vue app runs at `http://localhost:5173`; Vite proxies API requests to Express.

## Verification

```sh
npm run check
```

This runs the settlement unit tests, strict client and server type checks, and
both production builds.

## Production

```sh
npm ci
npm run build
npm run db:migrate
npm run db:seed
npm start
```

The seed command is idempotent. It creates the initial household and users only
when they do not already exist.
