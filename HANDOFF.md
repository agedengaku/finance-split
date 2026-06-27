# Finance Split Handoff

Current project snapshot:

- Purpose: household expense splitter for two people
- Stack: Node/Express backend, Vue 3 frontend, Tailwind CSS, TypeScript, MySQL
- Hosting target: Hawk Host
- Repo: public GitHub repo at `agedengaku/finance-split`
- Money rules: Japanese yen only, whole numbers only, no cents

Core behavior:

- Track income for both household members
- Track shared expenses
- Calculate settlement based on each person's share of total household income
- Support manual expense entry and CSV import
- Support multiple CSV uploads for the same period
- Support recurring expense templates that auto-fill new periods

CSV import rules:

- Required columns: `description`, `amount`, `paid_by`
- Optional columns: `date`, `category`, `notes`
- Leave optional fields blank if you do not have a value
- Do not write `NULL` in the CSV
- `date` is optional for imports
- `paid_by` should use the household member's name

Current category behavior:

- Categories are free-text, not a fixed list
- There is no hard-coded category set yet

Income notes:

- Household support or government support can be included as income if it should count toward the shared budget

Status notes:

- Authentication is already in place
- CSV import is already in place
- Recurring expense templates are already in place
- The app is set up for local development and can be viewed on localhost
