import { query } from '../db.js';
import { config } from '../config.js';

/**
 * Check if user is within tier limits for knowledge entries.
 */
export async function checkKnowledgeLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const userResult = await query('SELECT tier FROM users WHERE id = $1', [userId]);
  const tier = userResult.rows[0]?.tier || 'free';
  const limit = config.tierLimits[tier]?.knowledgeEntries || 500;

  const countResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM knowledge_entries WHERE user_id = $1',
    [userId]
  );
  const current = countResult.rows[0]?.cnt || 0;

  return { allowed: current < limit, current, limit };
}

/**
 * Check if team can add more members.
 */
export async function checkTeamMemberLimit(teamId: string, ownerId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const userResult = await query('SELECT tier FROM users WHERE id = $1', [ownerId]);
  const tier = userResult.rows[0]?.tier || 'free';
  const limit = config.tierLimits[tier]?.teamMembers || 0;

  const countResult = await query(
    'SELECT COUNT(*)::int AS cnt FROM team_members WHERE team_id = $1',
    [teamId]
  );
  const current = countResult.rows[0]?.cnt || 0;

  return { allowed: current < limit, current, limit };
}

/**
 * Log a sync action for usage tracking.
 */
export async function logSyncAction(userId: string, action: string, entriesCount: number): Promise<void> {
  await query(
    'INSERT INTO sync_log (user_id, action, entries_count) VALUES ($1, $2, $3)',
    [userId, action, entriesCount]
  );
}

/**
 * Get usage stats for a user.
 */
export async function getUsageStats(userId: string): Promise<{
  knowledgeEntries: number;
  sessionSummaries: number;
  syncActions: number;
  tier: string;
}> {
  const [keResult, ssResult, syncResult, userResult] = await Promise.all([
    query('SELECT COUNT(*)::int AS cnt FROM knowledge_entries WHERE user_id = $1', [userId]),
    query('SELECT COUNT(*)::int AS cnt FROM session_summaries WHERE user_id = $1', [userId]),
    query('SELECT COUNT(*)::int AS cnt FROM sync_log WHERE user_id = $1', [userId]),
    query('SELECT tier FROM users WHERE id = $1', [userId]),
  ]);

  return {
    knowledgeEntries: keResult.rows[0]?.cnt || 0,
    sessionSummaries: ssResult.rows[0]?.cnt || 0,
    syncActions: syncResult.rows[0]?.cnt || 0,
    tier: userResult.rows[0]?.tier || 'free',
  };
}
