import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { config } from '../config.js'

const connection = await mysql.createConnection({
  ...config.db,
  multipleStatements: true,
})

try {
  const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url))
  const schema = await fs.readFile(schemaPath, 'utf8')
  await connection.query(schema)
  await connection.query(
    `INSERT IGNORE INTO schema_migrations (version) VALUES ('001_initial_schema')`,
  )
  console.log('Database migration complete.')
} finally {
  await connection.end()
}
