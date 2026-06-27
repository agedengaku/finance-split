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

  const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url))
  const migrationFiles = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const migrationFile of migrationFiles) {
    const version = migrationFile.replace(/\.sql$/, '')
    const [rows] = await connection.execute(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [version],
    )
    if (Array.isArray(rows) && rows.length > 0) continue

    const migration = await fs.readFile(
      new URL(`../migrations/${migrationFile}`, import.meta.url),
      'utf8',
    )
    await connection.query(migration)
    await connection.execute(
      'INSERT INTO schema_migrations (version) VALUES (?)',
      [version],
    )
    console.log(`Applied migration ${version}.`)
  }

  console.log('Database migration complete.')
} finally {
  await connection.end()
}
