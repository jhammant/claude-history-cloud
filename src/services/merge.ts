import { query } from '../db.js';

/**
 * Dedup and merge knowledge entries.
 * Uses (user_id, type, project, summary) as a soft unique key.
 * Returns the number of new entries inserted (skips duplicates).
 */
export async function mergeKnowledgeEntries(
  userId: string,
  teamId: string | null,
  entries: Array<{
    type: string;
    project?: string;
    sessionId?: string;
    timestamp: number;
    summary: string;
    details?: string;
    tags?: string[];
    relatedFiles?: string[];
  }>
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    // Check for existing entry with same user, type, project, and summary
    const existing = await query(
      `SELECT id FROM knowledge_entries
       WHERE user_id = $1 AND type = $2 AND project IS NOT DISTINCT FROM $3 AND summary = $4
       LIMIT 1`,
      [userId, entry.type, entry.project || null, entry.summary]
    );

    if (existing.rows.length > 0) {
      // Update timestamp if newer
      await query(
        `UPDATE knowledge_entries SET timestamp = GREATEST(timestamp, $1), updated_at = NOW()
         WHERE id = $2`,
        [entry.timestamp, existing.rows[0].id]
      );
      skipped++;
    } else {
      await query(
        `INSERT INTO knowledge_entries (user_id, team_id, type, project, session_id, timestamp, summary, details, tags, related_files)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, teamId, entry.type, entry.project || null, entry.sessionId || null,
         entry.timestamp, entry.summary, entry.details || null, entry.tags || [], entry.relatedFiles || []]
      );
      inserted++;
    }
  }

  return { inserted, skipped };
}

/**
 * Merge session summaries — upsert by (user_id, session_id).
 */
export async function mergeSessionSummaries(
  userId: string,
  teamId: string | null,
  summaries: Array<{ sessionId: string; project?: string; summary: Record<string, unknown> }>
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const s of summaries) {
    const result = await query(
      `INSERT INTO session_summaries (user_id, team_id, session_id, project, summary)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, session_id) DO UPDATE SET summary = $5, project = $4
       RETURNING (xmax = 0) AS is_new`,
      [userId, teamId, s.sessionId, s.project || null, JSON.stringify(s.summary)]
    );
    if (result.rows[0]?.is_new) inserted++;
    else updated++;
  }

  return { inserted, updated };
}
