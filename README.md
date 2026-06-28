# FairShare

A full-stack TypeScript application for splitting household expenses in
proportion to each person's income. It tracks who initially paid each expense
and calculates the final payment required to settle the period.

## Features

- Custom monthly or multi-month calculation periods
- Income-weighted expense allocation
- Expense tracking by payer, date, and category
- Repeatable CSV expense imports with validation, duplicate warnings, and batch undo
- Recurring expense templates that can be copied into each new period
- Yearly income and expense trend reports by calculation period and expense category
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

## CSV expense imports

Open a calculation period, select **Import CSV**, and upload a UTF-8 CSV file.
You can also download a template directly from the import form.

The first row must contain column headers:

```csv
date,description,category,amount,paid_by,notes
```

The required columns are:

| Column        | Format                                                        |
| ------------- | ------------------------------------------------------------- |
| `description` | Expense description, up to 160 characters                     |
| `amount`      | Positive whole-yen amount, such as `8500`                     |
| `paid_by`     | Household member's display name; matching is case-insensitive |

The optional columns are:

| Column     | Format                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| `date`     | `YYYY-MM-DD`; when provided, it must fall within the selected calculation period |
| `category` | Category name, up to 80 characters                                               |
| `notes`    | Additional details, up to 2,000 characters                                       |

Example:

```csv
date,description,category,amount,paid_by,notes
2026-06-02,Groceries,Food,8500,You,
2026-06-05,Electricity,Utilities,12000,Partner,June bill
2026-06-08,"Household supplies, kitchen",Household,3200,You,
,Water bill,Utilities,4200,Partner,Date not recorded
```

Header names are normalized for capitalization, spaces, and hyphens.
`date` may be blank or omitted. `expense_date` is also accepted for `date`, and `payer` is accepted for
`paid_by`. Fields containing commas must use standard CSV double quotes.

Each file may contain up to 500 expense rows and must be smaller than 2 MB.
Invalid rows cannot be selected for import. Possible duplicates—matching date,
description, amount, and payer—are shown in the preview and unchecked by
default, but can be selected when the duplicate is intentional.

CSV uploads append to existing expenses; they never replace a previous upload.
Every upload is stored as a separate batch. Undoing a batch deletes only the
expenses belonging to that batch. All selected rows are saved in one database
transaction, so a server-side validation failure does not result in a partial
import.

## Recurring expenses

Use the recurring expense form inside a calculation period to save shared costs
you want to reuse every time, such as rent or subscriptions. Saved templates are
copied into each new period automatically.

If the current period is open, you can also add the recurring expense to that
period immediately when you save the template.

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

This runs ESLint, Stylelint, Prettier's formatting check, the settlement unit
tests, strict client and server type checks, and both production builds.

Useful commands while editing:

```sh
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

ESLint uses the recommended JavaScript, TypeScript, and Vue rules. Stylelint
uses its standard CSS rules and supports styles inside Vue components. Prettier
is the single source of truth for code formatting.

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

Production releases are automated through GitHub Actions. A release branch is
merged into `main`, then a matching semantic version tag triggers verification,
deployment to Hawk Host, a production health check, and a GitHub release with
generated notes. See [Production releases](docs/DEPLOYMENT.md) for the one-time
configuration and release procedure.
