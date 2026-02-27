import pg from 'pg';

const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/claude_history_test';

// Override env before any app imports
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // don't listen

export async function resetDb() {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query(`
    TRUNCATE users, teams, team_members, knowledge_entries, session_summaries, sync_log,
             community_patterns, pattern_contributions CASCADE
  `);
  await pool.end();
}
