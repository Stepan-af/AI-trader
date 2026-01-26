#!/usr/bin/env node
/**
 * Database Migration Runner
 * Executes SQL migrations in order
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('✓ Connected to database');

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, '../infra/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`\nFound ${files.length} migration files`);

    // Check which migrations have already been executed
    const executedResult = await pool.query(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const executedMigrations = new Set(executedResult.rows.map((r) => r.filename));

    // Execute pending migrations
    let executedCount = 0;
    for (const filename of files) {
      if (executedMigrations.has(filename)) {
        console.log(`⊘ Skipping ${filename} (already executed)`);
        continue;
      }

      console.log(`▶ Executing ${filename}...`);

      const filePath = path.join(migrationsDir, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`✓ Successfully executed ${filename}`);
        executedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`✗ Failed to execute ${filename}:`, error.message);
        throw error;
      } finally {
        client.release();
      }
    }

    if (executedCount === 0) {
      console.log('\n✓ Database schema is up to date');
    } else {
      console.log(`\n✓ Successfully executed ${executedCount} migrations`);
    }
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
