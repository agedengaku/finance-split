import bcrypt from 'bcryptjs'
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'
import rateLimit from 'express-rate-limit'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool, withTransaction } from './db.js'
import { calculateSettlement } from './settlement.js'
import type { HouseholdMembership } from './types.js'

export const api = express.Router()

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<unknown>

const asyncRoute =
  (handler: AsyncHandler): RequestHandler =>
  (request, response, next) =>
    Promise.resolve(handler(request, response, next)).catch(next)

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
})

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message)
}

function requiredText(value: unknown, label: string, maxLength = 160): string {
  const text = String(value ?? '').trim()
  if (!text) throw httpError(400, `${label} is required.`)
  if (text.length > maxLength) {
    throw httpError(400, `${label} must be ${maxLength} characters or fewer.`)
  }
  return text
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (text.length > maxLength) {
    throw httpError(400, `${label} must be ${maxLength} characters or fewer.`)
  }
  return text
}

function money(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}): string {
  const text = String(value ?? '').trim()
  if (!/^\d{1,13}$/.test(text)) {
    throw httpError(400, 'Enter a valid whole-yen amount.')
  }
  if (!allowZero && Number(text) <= 0) {
    throw httpError(400, 'Amount must be greater than zero.')
  }
  return text.replace(/^0+(?=\d)/, '')
}

function date(value: unknown, label: string): string {
  const text = String(value ?? '')
  const parsed = new Date(`${text}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw httpError(400, `${label} must be a valid date.`)
  }
  return text
}

function id(value: unknown, label = 'ID'): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${label} is invalid.`)
  }
  return parsed
}

const requireAuth: RequestHandler = (request, _response, next) => {
  if (!request.session.userId) return next(httpError(401, 'Please sign in.'))
  next()
}

async function membershipFor(userId: number): Promise<HouseholdMembership | null> {
  const [rows] = await pool.execute<(HouseholdMembership & RowDataPacket)[]>(
    `SELECT hm.household_id AS householdId, hm.role, h.name, h.currency
       FROM household_members hm
       JOIN households h ON h.id = hm.household_id
      WHERE hm.user_id = ?
      LIMIT 1`,
    [userId],
  )
  return rows[0] || null
}

const requireMembership: AsyncHandler = async (request, _response, next) => {
  const membership = await membershipFor(request.session.userId!)
  if (!membership) return next(httpError(403, 'This user does not belong to a household.'))
  request.membership = membership
  next()
}

interface PeriodRecord extends RowDataPacket {
  id: number
  label: string
  startDate: string
  endDate: string
  status: 'open' | 'closed'
}

interface UserRow extends RowDataPacket {
  id: number
  email: string
  displayName: string
}

interface AuthUserRow extends UserRow {
  passwordHash: string
}

interface MemberRow extends RowDataPacket {
  id: number
  displayName: string
  role: 'owner' | 'member'
}

interface SettlementMemberRow extends RowDataPacket {
  id: number
  name: string
  income: string
}

interface ExpenseRow extends RowDataPacket {
  id: number
  expenseDate: string | null
  description: string
  category: string | null
  amount: string
  importId: number | null
  paidBy: number
  payerName: string
  notes: string | null
}

interface OwedAmountRow extends RowDataPacket {
  id: number
  amount: string
  description: string
  fromUserId: number
  fromName: string
  toUserId: number
  toName: string
  notes: string | null
}

interface ExpenseImportRow extends RowDataPacket {
  id: number
  sourceName: string
  rowCount: number
  totalAmount: string
  importedBy: string
  importedAt: string
}

interface RecurringExpenseRow extends RowDataPacket {
  id: number
  description: string
  category: string | null
  amount: string
  paidBy: number
  payerName: string
  notes: string | null
}

interface ExpenseLookupRow extends RowDataPacket {
  id: number
  periodId: number
}

interface ImportLookupRow extends RowDataPacket {
  id: number
  status: 'open' | 'closed'
}

interface ExpenseStatusRow extends RowDataPacket {
  id: number
  status: 'open' | 'closed'
}

interface OwedAmountLookupRow extends RowDataPacket {
  id: number
  periodId: number
}

interface OwedAmountStatusRow extends RowDataPacket {
  id: number
  status: 'open' | 'closed'
}

interface RecurringExpenseLookupRow extends RowDataPacket {
  id: number
  householdId: number
}

async function getPeriod(
  periodId: number,
  householdId: number,
  connection: Pool | PoolConnection = pool,
): Promise<PeriodRecord> {
  const [rows] = await connection.execute<PeriodRecord[]>(
    `SELECT id, label, DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, status
       FROM periods
      WHERE id = ? AND household_id = ?`,
    [periodId, householdId],
  )
  if (!rows[0]) throw httpError(404, 'Calculation period not found.')
  return rows[0]
}

async function assertMember(
  userId: number,
  householdId: number,
  connection: Pool | PoolConnection = pool,
): Promise<void> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT 1 FROM household_members WHERE user_id = ? AND household_id = ?',
    [userId, householdId],
  )
  if (!rows[0]) throw httpError(400, 'Selected payer is not a household member.')
}

function assertEditable(period: Pick<PeriodRecord, 'status'>): void {
  if (period.status === 'closed') {
    throw httpError(409, 'Reopen this period before changing income, expenses, or owed amounts.')
  }
}

async function getRecurringExpenseRows(
  householdId: number,
  connection: Pool | PoolConnection = pool,
): Promise<RecurringExpenseRow[]> {
  const [rows] = await connection.execute<RecurringExpenseRow[]>(
    `SELECT re.id, re.description, re.category, re.amount, re.paid_by AS paidBy,
            u.display_name AS payerName, re.notes
       FROM recurring_expenses re
       JOIN users u ON u.id = re.paid_by
      WHERE re.household_id = ?
      ORDER BY re.created_at DESC, re.id DESC`,
    [householdId],
  )
  return rows
}

async function applyRecurringExpensesToPeriod(
  connection: Pool | PoolConnection,
  householdId: number,
  period: PeriodRecord,
  createdBy: number,
): Promise<number> {
  const recurringRows = await getRecurringExpenseRows(householdId, connection)
  for (const row of recurringRows) {
    await connection.execute(
      `INSERT INTO expenses
         (period_id, expense_date, description, category, amount, paid_by, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        period.id,
        period.startDate,
        row.description,
        row.category,
        row.amount,
        row.paidBy,
        row.notes,
        createdBy,
      ],
    )
  }
  return recurringRows.length
}

api.post(
  '/auth/login',
  loginLimiter,
  asyncRoute(async (request, response) => {
    const email = String(request.body.email ?? '')
      .trim()
      .toLowerCase()
    const password = String(request.body.password ?? '')

    const [rows] = await pool.execute<AuthUserRow[]>(
      'SELECT id, email, display_name AS displayName, password_hash AS passwordHash FROM users WHERE email = ?',
      [email],
    )
    const user = rows[0]
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw httpError(401, 'Email or password is incorrect.')
    }

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    request.session.userId = user.id
    response.json({
      user: { id: user.id, email: user.email, displayName: user.displayName },
    })
  }),
)

api.post('/auth/logout', requireAuth, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error)
    response.clearCookie('finance.sid')
    response.status(204).end()
  })
})

api.get(
  '/auth/me',
  requireAuth,
  asyncRoute(async (request, response) => {
    const [rows] = await pool.execute<UserRow[]>(
      'SELECT id, email, display_name AS displayName FROM users WHERE id = ?',
      [request.session.userId!],
    )
    if (!rows[0]) throw httpError(401, 'Please sign in.')
    response.json({ user: rows[0] })
  }),
)

api.use(requireAuth, asyncRoute(requireMembership))

api.get(
  '/bootstrap',
  asyncRoute(async (request, response) => {
    const [userRows] = await pool.execute<UserRow[]>(
      'SELECT id, email, display_name AS displayName FROM users WHERE id = ?',
      [request.session.userId!],
    )
    const [memberRows] = await pool.execute<MemberRow[]>(
      `SELECT u.id, u.display_name AS displayName, hm.role
         FROM household_members hm
         JOIN users u ON u.id = hm.user_id
        WHERE hm.household_id = ?
        ORDER BY hm.created_at, u.id`,
      [request.membership.householdId],
    )
    response.json({
      user: userRows[0],
      household: {
        id: request.membership.householdId,
        name: request.membership.name,
        currency: request.membership.currency,
        role: request.membership.role,
        members: memberRows,
      },
    })
  }),
)

api.put(
  '/household',
  asyncRoute(async (request, response) => {
    if (request.membership.role !== 'owner') {
      throw httpError(403, 'Only the household owner can change these settings.')
    }
    const name = requiredText(request.body.name, 'Household name', 100)
    const currency = String(request.body.currency ?? '')
      .trim()
      .toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw httpError(400, 'Currency must be a three-letter code such as USD or JPY.')
    }
    await pool.execute('UPDATE households SET name = ?, currency = ? WHERE id = ?', [
      name,
      currency,
      request.membership.householdId,
    ])
    response.json({ household: { ...request.membership, name, currency } })
  }),
)

api.get(
  '/periods',
  asyncRoute(async (request, response) => {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.label,
              DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
              DATE_FORMAT(p.end_date, '%Y-%m-%d') AS endDate,
              p.status,
              COALESCE(SUM(e.amount), 0) AS totalExpenses,
              COUNT(e.id) AS expenseCount
         FROM periods p
         LEFT JOIN expenses e ON e.period_id = p.id
        WHERE p.household_id = ?
        GROUP BY p.id
        ORDER BY p.start_date DESC, p.id DESC`,
      [request.membership.householdId],
    )
    response.json({ periods: rows })
  }),
)

api.get(
  '/reports/yearly',
  asyncRoute(async (request, response) => {
    const requestedYear = String(request.query.year ?? '').trim()
    const currentYear = new Date().getUTCFullYear()
    const year = requestedYear ? Number(requestedYear) : currentYear
    if (!/^\d{4}$/.test(requestedYear || String(currentYear)) || year < 2000 || year > 2100) {
      throw httpError(400, 'Year must be between 2000 and 2100.')
    }

    const [yearRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT YEAR(start_date) AS year
         FROM periods
        WHERE household_id = ?
        ORDER BY year DESC`,
      [request.membership.householdId],
    )
    const [periodRows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.label,
              DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
              DATE_FORMAT(p.end_date, '%Y-%m-%d') AS endDate,
              p.status,
              COALESCE(i.totalIncome, 0) AS totalIncome,
              COALESCE(e.totalExpenses, 0) AS totalExpenses
         FROM periods p
         LEFT JOIN (
           SELECT period_id, SUM(amount) AS totalIncome
             FROM incomes
            GROUP BY period_id
         ) i ON i.period_id = p.id
         LEFT JOIN (
           SELECT period_id, SUM(amount) AS totalExpenses
             FROM expenses
            GROUP BY period_id
         ) e ON e.period_id = p.id
        WHERE p.household_id = ?
          AND p.start_date >= ?
          AND p.start_date < ?
        ORDER BY p.start_date, p.id`,
      [request.membership.householdId, `${year}-01-01`, `${year + 1}-01-01`],
    )
    const [categoryRows] = await pool.execute<RowDataPacket[]>(
      `SELECT category, totalExpenses, expenseCount
         FROM (
           SELECT NULLIF(TRIM(e.category), '') AS category,
                  SUM(e.amount) AS totalExpenses,
                  COUNT(e.id) AS expenseCount
             FROM expenses e
             JOIN periods p ON p.id = e.period_id
            WHERE p.household_id = ?
              AND p.start_date >= ?
              AND p.start_date < ?
            GROUP BY NULLIF(TRIM(e.category), '')
         ) categoryTotals
        ORDER BY category IS NULL, totalExpenses DESC, category`,
      [request.membership.householdId, `${year}-01-01`, `${year + 1}-01-01`],
    )

    response.json({
      year,
      availableYears: yearRows.map((row) => Number(row.year)),
      periods: periodRows,
      categories: categoryRows,
    })
  }),
)

api.post(
  '/periods',
  asyncRoute(async (request, response) => {
    const label = requiredText(request.body.label, 'Period name', 100)
    const startDate = date(request.body.startDate, 'Start date')
    const endDate = date(request.body.endDate, 'End date')
    if (startDate > endDate) throw httpError(400, 'End date must be on or after the start date.')

    const period = await withTransaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO periods (household_id, label, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [request.membership.householdId, label, startDate, endDate, request.session.userId!],
      )
      const created = await getPeriod(result.insertId, request.membership.householdId, connection)
      await applyRecurringExpensesToPeriod(
        connection,
        request.membership.householdId,
        created,
        request.session.userId!,
      )
      return created
    })
    response.status(201).json({ period })
  }),
)

api.get(
  '/periods/:periodId',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const period = await getPeriod(periodId, request.membership.householdId)
    const [memberRows] = await pool.execute<SettlementMemberRow[]>(
      `SELECT u.id, u.display_name AS name, COALESCE(i.amount, 0) AS income
         FROM household_members hm
         JOIN users u ON u.id = hm.user_id
         LEFT JOIN incomes i ON i.user_id = u.id AND i.period_id = ?
        WHERE hm.household_id = ?
        ORDER BY hm.created_at, u.id`,
      [periodId, request.membership.householdId],
    )
    const [expenseRows] = await pool.execute<ExpenseRow[]>(
      `SELECT e.id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expenseDate,
              e.description, e.category, e.amount, e.paid_by AS paidBy,
              e.import_id AS importId, u.display_name AS payerName, e.notes
         FROM expenses e
         JOIN users u ON u.id = e.paid_by
        WHERE e.period_id = ?
        ORDER BY e.expense_date DESC, e.id DESC`,
      [periodId],
    )
    const [owedAmountRows] = await pool.execute<OwedAmountRow[]>(
      `SELECT oa.id, oa.amount, oa.description, oa.from_user_id AS fromUserId,
              from_user.display_name AS fromName, oa.to_user_id AS toUserId,
              to_user.display_name AS toName, oa.notes
         FROM owed_amounts oa
         JOIN users from_user ON from_user.id = oa.from_user_id
         JOIN users to_user ON to_user.id = oa.to_user_id
        WHERE oa.period_id = ?
        ORDER BY oa.created_at DESC, oa.id DESC`,
      [periodId],
    )
    const [importRows] = await pool.execute<ExpenseImportRow[]>(
      `SELECT ei.id, ei.source_name AS sourceName, ei.row_count AS rowCount,
              ei.total_amount AS totalAmount, u.display_name AS importedBy,
              DATE_FORMAT(ei.created_at, '%Y-%m-%d %H:%i:%s') AS importedAt
         FROM expense_imports ei
         JOIN users u ON u.id = ei.imported_by
        WHERE ei.period_id = ?
        ORDER BY ei.created_at DESC, ei.id DESC`,
      [periodId],
    )
    const recurringExpenses = await getRecurringExpenseRows(request.membership.householdId)
    const summary = calculateSettlement(
      memberRows,
      expenseRows.map((expense) => ({
        amount: expense.amount,
        paidBy: expense.paidBy,
      })),
      owedAmountRows.map((owedAmount) => ({
        amount: owedAmount.amount,
        fromUserId: owedAmount.fromUserId,
        toUserId: owedAmount.toUserId,
      })),
    )
    response.json({
      period,
      members: memberRows,
      expenses: expenseRows,
      owedAmounts: owedAmountRows,
      recurringExpenses,
      imports: importRows,
      summary,
    })
  }),
)

api.put(
  '/periods/:periodId',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const current = await getPeriod(periodId, request.membership.householdId)
    const label = requiredText(request.body.label ?? current.label, 'Period name', 100)
    const startDate = date(request.body.startDate ?? current.startDate, 'Start date')
    const endDate = date(request.body.endDate ?? current.endDate, 'End date')
    const status = request.body.status ?? current.status
    if (!['open', 'closed'].includes(status)) throw httpError(400, 'Status is invalid.')
    if (startDate > endDate) throw httpError(400, 'End date must be on or after the start date.')
    await pool.execute(
      'UPDATE periods SET label = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?',
      [label, startDate, endDate, status, periodId],
    )
    response.json({
      period: await getPeriod(periodId, request.membership.householdId),
    })
  }),
)

api.put(
  '/periods/:periodId/incomes/:userId',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const userId = id(request.params.userId, 'User ID')
    const period = await getPeriod(periodId, request.membership.householdId)
    assertEditable(period)
    await assertMember(userId, request.membership.householdId)
    const amount = money(request.body.amount, { allowZero: true })
    await pool.execute(
      `INSERT INTO incomes (period_id, user_id, amount)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
      [periodId, userId, amount],
    )
    response.json({ income: { periodId, userId, amount } })
  }),
)

api.post(
  '/periods/:periodId/imports',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const sourceName = requiredText(request.body.sourceName, 'File name', 255)
    const rawRows: unknown = request.body.rows
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      throw httpError(400, 'The import must contain at least one expense.')
    }
    if (rawRows.length > 500) {
      throw httpError(400, 'A single import cannot contain more than 500 expenses.')
    }

    const result = await withTransaction(async (connection) => {
      const period = await getPeriod(periodId, request.membership.householdId, connection)
      assertEditable(period)

      const [memberRows] = await connection.execute<RowDataPacket[]>(
        'SELECT user_id AS userId FROM household_members WHERE household_id = ?',
        [request.membership.householdId],
      )
      const memberIds = new Set(memberRows.map((row) => Number(row.userId)))
      const rows = rawRows.map((rawRow, index) => {
        if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
          throw httpError(400, `CSV row ${index + 2} is invalid.`)
        }
        const row = rawRow as Record<string, unknown>
        const paidBy = id(row.paidBy, `Payer on CSV row ${index + 2}`)
        if (!memberIds.has(paidBy)) {
          throw httpError(400, `Payer on CSV row ${index + 2} is not a household member.`)
        }
        const rawDate = String(row.expenseDate ?? '').trim()
        const expenseDate = rawDate ? date(rawDate, `Date on CSV row ${index + 2}`) : null
        if (expenseDate && (expenseDate < period.startDate || expenseDate > period.endDate)) {
          throw httpError(
            400,
            `Date on CSV row ${index + 2} falls outside this calculation period.`,
          )
        }
        return {
          expenseDate,
          description: requiredText(row.description, `Description on CSV row ${index + 2}`, 160),
          category: optionalText(row.category, `Category on CSV row ${index + 2}`, 80),
          amount: money(row.amount),
          paidBy,
          notes: optionalText(row.notes, `Notes on CSV row ${index + 2}`, 2000),
        }
      })

      const totalAmount = rows.reduce((total, row) => total + BigInt(row.amount), 0n)
      const [importResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO expense_imports
           (period_id, source_name, row_count, total_amount, imported_by)
         VALUES (?, ?, ?, ?, ?)`,
        [periodId, sourceName, rows.length, totalAmount.toString(), request.session.userId!],
      )

      for (const row of rows) {
        await connection.execute(
          `INSERT INTO expenses
             (period_id, import_id, expense_date, description, category, amount,
              paid_by, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            periodId,
            importResult.insertId,
            row.expenseDate,
            row.description,
            row.category,
            row.amount,
            row.paidBy,
            row.notes,
            request.session.userId!,
          ],
        )
      }

      return {
        id: importResult.insertId,
        rowCount: rows.length,
        totalAmount: totalAmount.toString(),
      }
    })

    response.status(201).json({ import: result })
  }),
)

api.post(
  '/recurring-expenses',
  asyncRoute(async (request, response) => {
    const description = requiredText(request.body.description, 'Description', 160)
    const category = optionalText(request.body.category, 'Category', 80)
    const amount = money(request.body.amount)
    const paidBy = id(request.body.paidBy, 'Payer')
    await assertMember(paidBy, request.membership.householdId)
    const notes = optionalText(request.body.notes, 'Notes', 2000)
    const applyToPeriodId =
      request.body.applyToPeriodId === undefined || request.body.applyToPeriodId === null
        ? null
        : id(request.body.applyToPeriodId, 'Period ID')

    const result = await withTransaction(async (connection) => {
      let appliedExpenseId: number | null = null
      if (applyToPeriodId) {
        const period = await getPeriod(applyToPeriodId, request.membership.householdId, connection)
        assertEditable(period)
        const [expenseResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO expenses
             (period_id, expense_date, description, category, amount, paid_by, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            period.id,
            period.startDate,
            description,
            category,
            amount,
            paidBy,
            notes,
            request.session.userId!,
          ],
        )
        appliedExpenseId = expenseResult.insertId
      }

      const [templateResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO recurring_expenses
           (household_id, description, category, amount, paid_by, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          request.membership.householdId,
          description,
          category,
          amount,
          paidBy,
          notes,
          request.session.userId!,
        ],
      )

      return {
        recurringExpense: {
          id: templateResult.insertId,
        },
        appliedExpenseId,
      }
    })

    response.status(201).json(result)
  }),
)

api.put(
  '/recurring-expenses/:recurringExpenseId',
  asyncRoute(async (request, response) => {
    const recurringExpenseId = id(request.params.recurringExpenseId, 'Recurring expense ID')
    const description = requiredText(request.body.description, 'Description', 160)
    const category = optionalText(request.body.category, 'Category', 80)
    const amount = money(request.body.amount)
    const paidBy = id(request.body.paidBy, 'Payer')
    await assertMember(paidBy, request.membership.householdId)
    const notes = optionalText(request.body.notes, 'Notes', 2000)

    const [rows] = await pool.execute<RecurringExpenseLookupRow[]>(
      `SELECT re.id, re.household_id AS householdId
         FROM recurring_expenses re
        WHERE re.id = ? AND re.household_id = ?`,
      [recurringExpenseId, request.membership.householdId],
    )
    if (!rows[0]) throw httpError(404, 'Recurring expense not found.')

    await pool.execute(
      `UPDATE recurring_expenses
          SET description = ?, category = ?, amount = ?, paid_by = ?, notes = ?
        WHERE id = ?`,
      [description, category, amount, paidBy, notes, recurringExpenseId],
    )

    response.json({ recurringExpense: { id: recurringExpenseId } })
  }),
)

api.delete(
  '/recurring-expenses/:recurringExpenseId',
  asyncRoute(async (request, response) => {
    const recurringExpenseId = id(request.params.recurringExpenseId, 'Recurring expense ID')
    const [rows] = await pool.execute<RecurringExpenseLookupRow[]>(
      `SELECT re.id, re.household_id AS householdId
         FROM recurring_expenses re
        WHERE re.id = ? AND re.household_id = ?`,
      [recurringExpenseId, request.membership.householdId],
    )
    if (!rows[0]) throw httpError(404, 'Recurring expense not found.')

    await pool.execute('DELETE FROM recurring_expenses WHERE id = ?', [recurringExpenseId])
    response.status(204).end()
  }),
)

api.post(
  '/periods/:periodId/expenses',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const period = await getPeriod(periodId, request.membership.householdId)
    assertEditable(period)
    const paidBy = id(request.body.paidBy, 'Payer')
    await assertMember(paidBy, request.membership.householdId)
    const expenseDate = date(request.body.expenseDate, 'Expense date')
    if (expenseDate < period.startDate || expenseDate > period.endDate) {
      throw httpError(400, 'Expense date must fall within this calculation period.')
    }
    const description = requiredText(request.body.description, 'Description', 160)
    const category = optionalText(request.body.category, 'Category', 80)
    const amount = money(request.body.amount)
    const notes = optionalText(request.body.notes, 'Notes', 2000)

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO expenses
         (period_id, expense_date, description, category, amount, paid_by, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        periodId,
        expenseDate,
        description,
        category,
        amount,
        paidBy,
        notes,
        request.session.userId!,
      ],
    )
    response.status(201).json({ expense: { id: result.insertId } })
  }),
)

api.post(
  '/periods/:periodId/owed-amounts',
  asyncRoute(async (request, response) => {
    const periodId = id(request.params.periodId, 'Period ID')
    const period = await getPeriod(periodId, request.membership.householdId)
    assertEditable(period)
    const fromUserId = id(request.body.fromUserId, 'Person who owes')
    const toUserId = id(request.body.toUserId, 'Person owed')
    if (fromUserId === toUserId) {
      throw httpError(400, 'Choose two different people for an owed amount.')
    }
    await assertMember(fromUserId, request.membership.householdId)
    await assertMember(toUserId, request.membership.householdId)
    const amount = money(request.body.amount)
    const description = requiredText(request.body.description, 'Description', 160)
    const notes = optionalText(request.body.notes, 'Notes', 2000)

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO owed_amounts
         (period_id, from_user_id, to_user_id, amount, description, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [periodId, fromUserId, toUserId, amount, description, notes, request.session.userId!],
    )
    response.status(201).json({ owedAmount: { id: result.insertId } })
  }),
)

api.delete(
  '/imports/:importId',
  asyncRoute(async (request, response) => {
    const importId = id(request.params.importId, 'Import ID')
    const [rows] = await pool.execute<ImportLookupRow[]>(
      `SELECT ei.id, p.status
         FROM expense_imports ei
         JOIN periods p ON p.id = ei.period_id
        WHERE ei.id = ? AND p.household_id = ?`,
      [importId, request.membership.householdId],
    )
    if (!rows[0]) throw httpError(404, 'Import batch not found.')
    assertEditable(rows[0])
    await pool.execute('DELETE FROM expense_imports WHERE id = ?', [importId])
    response.status(204).end()
  }),
)

api.put(
  '/expenses/:expenseId',
  asyncRoute(async (request, response) => {
    const expenseId = id(request.params.expenseId, 'Expense ID')
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute<ExpenseLookupRow[]>(
        `SELECT e.id, e.period_id AS periodId
           FROM expenses e
           JOIN periods p ON p.id = e.period_id
          WHERE e.id = ? AND p.household_id = ?
          FOR UPDATE`,
        [expenseId, request.membership.householdId],
      )
      if (!rows[0]) throw httpError(404, 'Expense not found.')
      const period = await getPeriod(rows[0].periodId, request.membership.householdId, connection)
      assertEditable(period)
      const paidBy = id(request.body.paidBy, 'Payer')
      await assertMember(paidBy, request.membership.householdId, connection)
      const expenseDate = date(request.body.expenseDate, 'Expense date')
      if (expenseDate < period.startDate || expenseDate > period.endDate) {
        throw httpError(400, 'Expense date must fall within this calculation period.')
      }
      await connection.execute(
        `UPDATE expenses
            SET expense_date = ?, description = ?, category = ?, amount = ?,
                paid_by = ?, notes = ?
          WHERE id = ?`,
        [
          expenseDate,
          requiredText(request.body.description, 'Description', 160),
          optionalText(request.body.category, 'Category', 80),
          money(request.body.amount),
          paidBy,
          optionalText(request.body.notes, 'Notes', 2000),
          expenseId,
        ],
      )
    })
    response.json({ expense: { id: expenseId } })
  }),
)

api.delete(
  '/expenses/:expenseId',
  asyncRoute(async (request, response) => {
    const expenseId = id(request.params.expenseId, 'Expense ID')
    const [rows] = await pool.execute<ExpenseStatusRow[]>(
      `SELECT e.id, p.status
         FROM expenses e
         JOIN periods p ON p.id = e.period_id
        WHERE e.id = ? AND p.household_id = ?`,
      [expenseId, request.membership.householdId],
    )
    if (!rows[0]) throw httpError(404, 'Expense not found.')
    assertEditable(rows[0])
    await pool.execute('DELETE FROM expenses WHERE id = ?', [expenseId])
    response.status(204).end()
  }),
)

api.put(
  '/owed-amounts/:owedAmountId',
  asyncRoute(async (request, response) => {
    const owedAmountId = id(request.params.owedAmountId, 'Owed amount ID')
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute<OwedAmountLookupRow[]>(
        `SELECT oa.id, oa.period_id AS periodId
           FROM owed_amounts oa
           JOIN periods p ON p.id = oa.period_id
          WHERE oa.id = ? AND p.household_id = ?
          FOR UPDATE`,
        [owedAmountId, request.membership.householdId],
      )
      if (!rows[0]) throw httpError(404, 'Owed amount not found.')
      const period = await getPeriod(rows[0].periodId, request.membership.householdId, connection)
      assertEditable(period)
      const fromUserId = id(request.body.fromUserId, 'Person who owes')
      const toUserId = id(request.body.toUserId, 'Person owed')
      if (fromUserId === toUserId) {
        throw httpError(400, 'Choose two different people for an owed amount.')
      }
      await assertMember(fromUserId, request.membership.householdId, connection)
      await assertMember(toUserId, request.membership.householdId, connection)
      await connection.execute(
        `UPDATE owed_amounts
            SET from_user_id = ?, to_user_id = ?, amount = ?, description = ?, notes = ?
          WHERE id = ?`,
        [
          fromUserId,
          toUserId,
          money(request.body.amount),
          requiredText(request.body.description, 'Description', 160),
          optionalText(request.body.notes, 'Notes', 2000),
          owedAmountId,
        ],
      )
    })
    response.json({ owedAmount: { id: owedAmountId } })
  }),
)

api.delete(
  '/owed-amounts/:owedAmountId',
  asyncRoute(async (request, response) => {
    const owedAmountId = id(request.params.owedAmountId, 'Owed amount ID')
    const [rows] = await pool.execute<OwedAmountStatusRow[]>(
      `SELECT oa.id, p.status
         FROM owed_amounts oa
         JOIN periods p ON p.id = oa.period_id
        WHERE oa.id = ? AND p.household_id = ?`,
      [owedAmountId, request.membership.householdId],
    )
    if (!rows[0]) throw httpError(404, 'Owed amount not found.')
    assertEditable(rows[0])
    await pool.execute('DELETE FROM owed_amounts WHERE id = ?', [owedAmountId])
    response.status(204).end()
  }),
)
