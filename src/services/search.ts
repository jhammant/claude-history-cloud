import { query } from '../db.js';

/**
 * Full-text search across knowledge entries using PostgreSQL tsvector.
 */
export async function searchKnowledge(
  userId: string,
  teamId: string | null,
  q: string,
  opts: { project?: string; type?: string; limit: number; offset: number }
): Promise<{ entries: any[]; total: number }> {
  // Build ts_query from search terms
  const tsQuery = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => w.length > 1)
    .join(' & ');

  if (!tsQuery) return { entries: [], total: 0 };

  let where = teamId
    ? `(ke.user_id = $1 OR ke.team_id = $2)`
    : `ke.user_id = $1`;
  const params: any[] = teamId ? [userId, teamId] : [userId];
  let idx = params.length + 1;

  params.push(tsQuery);
  where += ` AND (
    to_tsvector('english', coalesce(ke.summary, '')) ||
    to_tsvector('english', coalesce(ke.details, ''))
  ) @@ to_tsquery('english', $${idx++})`;

  if (opts.project) { where += ` AND ke.project = $${idx++}`; params.push(opts.project); }
  if (opts.type) { where += ` AND ke.type = $${idx++}`; params.push(opts.type); }

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM knowledge_entries ke WHERE ${where}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(opts.limit, opts.offset);
  const result = await query(
    `SELECT ke.*,
       ts_rank(
         to_tsvector('english', coalesce(ke.summary, '')) ||
         to_tsvector('english', coalesce(ke.details, '')),
         to_tsquery('english', $${teamId ? 3 : 2})
       ) AS rank
     FROM knowledge_entries ke
     WHERE ${where}
     ORDER BY rank DESC, ke.timestamp DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { entries: result.rows, total };
}
