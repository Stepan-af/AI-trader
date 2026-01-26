/**
 * Database Configuration
 * PostgreSQL connection setup for backend services
 */

import { Pool } from 'pg';

/**
 * Create PostgreSQL connection pool
 */
export function createDatabasePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return new Pool({
    connectionString: databaseUrl,
    max: 20, // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query<{ test: number }>('SELECT 1 as test');
    return result.rows[0]?.test === 1;
  } catch (_error) {
    return false;
  }
}

/**
 * Close database pool gracefully
 */
export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
}
