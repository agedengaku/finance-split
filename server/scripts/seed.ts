import bcrypt from 'bcryptjs'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { pool, withTransaction } from '../db.js'

function requiredSeedValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const values = {
  householdName: process.env.HOUSEHOLD_NAME || 'Our household',
  currency: (process.env.HOUSEHOLD_CURRENCY || 'JPY').toUpperCase(),
  owner: {
    name: requiredSeedValue('OWNER_NAME'),
    email: requiredSeedValue('OWNER_EMAIL').toLowerCase(),
    password: requiredSeedValue('OWNER_PASSWORD'),
  },
  partner: {
    name: requiredSeedValue('PARTNER_NAME'),
    email: requiredSeedValue('PARTNER_EMAIL').toLowerCase(),
    password: requiredSeedValue('PARTNER_PASSWORD'),
  },
}

for (const [label, user] of Object.entries({ owner: values.owner, partner: values.partner })) {
  if (user.password.length < 12) {
    throw new Error(`${label} password must contain at least 12 characters`)
  }
}

if (!/^[A-Z]{3}$/.test(values.currency)) {
  throw new Error('HOUSEHOLD_CURRENCY must be a three-letter currency code')
}

await withTransaction(async (connection) => {
  const [existingRows] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM households LIMIT 1',
  )
  if (existingRows[0]) {
    console.log('A household already exists; seed skipped.')
    return
  }

  const [householdResult] = await connection.execute<ResultSetHeader>(
    'INSERT INTO households (name, currency) VALUES (?, ?)',
    [values.householdName, values.currency],
  )

  for (const [index, user] of [values.owner, values.partner].entries()) {
    const passwordHash = await bcrypt.hash(user.password, 12)
    const [userResult] = await connection.execute<ResultSetHeader>(
      'INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?)',
      [user.email, user.name, passwordHash],
    )
    await connection.execute(
      'INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)',
      [householdResult.insertId, userResult.insertId, index === 0 ? 'owner' : 'member'],
    )
  }
})

await pool.end()
console.log('Initial household users are ready.')
