import mysql from 'mysql2/promise'
import type { PoolConnection } from 'mysql2/promise'
import { config } from './config.js'

export const pool = mysql.createPool({
  ...config.db,
  connectionLimit: 10,
  enableKeepAlive: true,
  decimalNumbers: false,
  timezone: 'Z',
})

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await callback(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
