import { query } from '../db.js';

export interface KnowledgeEntry {
  type: string;
  project?: string;
  sessionId?: string;
  timestamp: number;
  summary: string;
  details?: string;
  tags?: string[];
  relatedFiles?: string[];
}

export async function createKnowledgeEntry(
  userId: string,
  teamId: string | null,
  entry: KnowledgeEntry
): Promise<string> {
  const result = await query(
    `INSERT INTO knowledge_entries (user_id, team_id, type, project, session_id, timestamp, summary, details, tags, related_files)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [userId, teamId, entry.type, entry.project || null, entry.sessionId || null,
     entry.timestamp, entry.summary, entry.details || null, entry.tags || [], entry.relatedFiles || []]
  );
  return result.rows[0].id;
}

export async function getKnowledgeEntry(id: string, userId: string): Promise<any | null> {
  const result = await query(
    `SELECT * FROM knowledge_entries WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function updateKnowledgeEntry(
  id: string,
  userId: string,
  updates: Partial<Pick<KnowledgeEntry, 'summary' | 'details' | 'tags' | 'relatedFiles'>>
): Promise<boolean> {
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (updates.summary !== undefined) { fields.push(`summary = $${idx++}`); params.push(updates.summary); }
  if (updates.details !== undefined) { fields.push(`details = $${idx++}`); params.push(updates.details); }
  if (updates.tags !== undefined) { fields.push(`tags = $${idx++}`); params.push(updates.tags); }
  if (updates.relatedFiles !== undefined) { fields.push(`related_files = $${idx++}`); params.push(updates.relatedFiles); }

  if (fields.length === 0) return false;

  fields.push(`updated_at = NOW()`);
  params.push(id, userId);

  const result = await query(
    `UPDATE knowledge_entries SET ${fields.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++}`,
    params
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteKnowledgeEntry(id: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM knowledge_entries WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listKnowledgeEntries(
  userId: string,
  teamId: string | null,
  opts: { project?: string; type?: string; limit: number; offset: number }
): Promise<{ entries: any[]; total: number }> {
  let where = teamId
    ? `(user_id = $1 OR team_id = $2)`
    : `user_id = $1`;
  const params: any[] = teamId ? [userId, teamId] : [userId];
  let idx = params.length + 1;

  if (opts.project) { where += ` AND project = $${idx++}`; params.push(opts.project); }
  if (opts.type) { where += ` AND type = $${idx++}`; params.push(opts.type); }

  const countResult = await query(`SELECT COUNT(*)::int AS total FROM knowledge_entries WHERE ${where}`, params);
  const total = countResult.rows[0]?.total || 0;

  params.push(opts.limit, opts.offset);
  const result = await query(
    `SELECT * FROM knowledge_entries WHERE ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { entries: result.rows, total };
}
