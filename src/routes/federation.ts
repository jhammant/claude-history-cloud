/**
 * Federation API Routes — receive, store, and serve anonymous community patterns.
 * 
 * POST   /api/federation/contribute      — receive anonymous patterns
 * GET    /api/federation/patterns         — list patterns (paginated, filtered)
 * GET    /api/federation/patterns/search  — full-text search
 * GET    /api/federation/stats            — community statistics
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { createHash } from 'crypto';

export const federationRouter = Router();

// ── Validation schemas ──────────────────────────────────────────────────────

const PatternSchema = z.object({
  id: z.string(),
  type: z.enum(['solution', 'error_fix', 'decision', 'pattern']),
  category: z.string().min(1).max(255),
  platform: z.string().max(255).optional(),
  approach: z.string().min(10).max(5000),
  tags: z.array(z.string().max(50)).max(20).default([]),
  effectiveness: z.number().min(0).max(1).default(0.5),
  contributorCount: z.number().int().min(1).default(1),
  firstSeen: z.number(),
  lastSeen: z.number(),
});

const ContributeSchema = z.object({
  contributorHash: z.string().length(64),
  patterns: z.array(PatternSchema).min(1).max(100),
});

// K-anonymity threshold — patterns only returned when this many contributors
const K_ANONYMITY_THRESHOLD = 3;

// ── POST /contribute ────────────────────────────────────────────────────────

federationRouter.post('/contribute', async (req: Request, res: Response) => {
  try {
    const body = ContributeSchema.parse(req.body);
    let accepted = 0;
    let merged = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (const pattern of body.patterns) {
      try {
        // Generate dedup hash from category + normalised approach
        const dedup = dedupHash(pattern.category, pattern.approach);

        // Check if pattern exists
        const existing = await query(
          'SELECT id, contributor_count, effectiveness FROM community_patterns WHERE hash = $1',
          [dedup]
        );

        if (existing.rows.length > 0) {
          // Merge: increment contributor count, update timestamps, recalculate effectiveness
          const row = existing.rows[0];

          // Record contribution (unique per contributor per pattern)
          try {
            await query(
              `INSERT INTO pattern_contributions (pattern_id, contributor_hash)
               VALUES ($1, $2)
               ON CONFLICT (pattern_id, contributor_hash) DO NOTHING`,
              [row.id, body.contributorHash]
            );
          } catch {
            // Contribution already recorded — that's fine
          }

          // Get actual unique contributor count
          const countResult = await query(
            'SELECT COUNT(DISTINCT contributor_hash)::int AS cnt FROM pattern_contributions WHERE pattern_id = $1',
            [row.id]
          );
          const newCount = (countResult.rows[0]?.cnt || row.contributor_count) + 0;

          // Recalculate effectiveness as weighted average
          const newEffectiveness = (
            (row.effectiveness * row.contributor_count + pattern.effectiveness) /
            (row.contributor_count + 1)
          );

          await query(
            `UPDATE community_patterns
             SET contributor_count = $1,
                 last_seen = NOW(),
                 effectiveness = $2
             WHERE id = $3`,
            [Math.max(newCount, row.contributor_count + 1), Math.min(newEffectiveness, 1), row.id]
          );

          merged++;
        } else {
          // New pattern — insert
          const result = await query(
            `INSERT INTO community_patterns (type, category, platform, approach, tags, effectiveness, contributor_count, first_seen, last_seen, hash)
             VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW(), $7)
             RETURNING id`,
            [pattern.type, pattern.category, pattern.platform || null, pattern.approach, pattern.tags, pattern.effectiveness, dedup]
          );

          // Record the contribution
          await query(
            `INSERT INTO pattern_contributions (pattern_id, contributor_hash)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [result.rows[0].id, body.contributorHash]
          );

          accepted++;
        }
      } catch (err: any) {
        rejected++;
        errors.push(err.message?.slice(0, 100) || 'Unknown error');
      }
    }

    res.json({ accepted, rejected, merged, errors: errors.slice(0, 10) });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    } else {
      console.error('Federation contribute error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ── GET /patterns ───────────────────────────────────────────────────────────

federationRouter.get('/patterns', async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const platform = req.query.platform as string | undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    let sql = `SELECT * FROM community_patterns WHERE contributor_count >= $1`;
    const params: any[] = [K_ANONYMITY_THRESHOLD];
    let paramIdx = 2;

    if (category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (platform) {
      sql += ` AND platform = $${paramIdx++}`;
      params.push(platform);
    }
    if (tags?.length) {
      sql += ` AND tags && $${paramIdx++}`;
      params.push(tags);
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS total');
    const countResult = await query(countSql, params);
    const total = countResult.rows[0]?.total || 0;

    // Fetch page
    sql += ` ORDER BY effectiveness DESC, contributor_count DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      patterns: result.rows.map(rowToPattern),
      total,
      offset,
      limit,
    });
  } catch (err: any) {
    console.error('Federation patterns error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /patterns/search ────────────────────────────────────────────────────

federationRouter.get('/patterns/search', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'Query parameter "q" is required (min 2 chars)' });
      return;
    }

    const category = req.query.category as string | undefined;
    const platform = req.query.platform as string | undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Build full-text search query
    const tsQuery = q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\w]/g, ''))
      .filter((w) => w.length > 1)
      .join(' & ');

    if (!tsQuery) {
      res.json({ patterns: [], total: 0, offset, limit });
      return;
    }

    let sql = `
      SELECT *, ts_rank(search_vector, to_tsquery('english', $1)) AS rank
      FROM community_patterns
      WHERE search_vector @@ to_tsquery('english', $1)
        AND contributor_count >= $2
    `;
    const params: any[] = [tsQuery, K_ANONYMITY_THRESHOLD];
    let paramIdx = 3;

    if (category) {
      sql += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (platform) {
      sql += ` AND platform = $${paramIdx++}`;
      params.push(platform);
    }
    if (tags?.length) {
      sql += ` AND tags && $${paramIdx++}`;
      params.push(tags);
    }

    // Count
    const countSql = sql.replace(/SELECT \*.*?FROM/, 'SELECT COUNT(*)::int AS total FROM');
    const countResult = await query(countSql, params);
    const total = countResult.rows[0]?.total || 0;

    sql += ` ORDER BY rank DESC, effectiveness DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      patterns: result.rows.map(rowToPattern),
      total,
      offset,
      limit,
    });
  } catch (err: any) {
    console.error('Federation search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /stats ──────────────────────────────────────────────────────────────

federationRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [patternsResult, contributorsResult, categoriesResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS total FROM community_patterns WHERE contributor_count >= $1', [K_ANONYMITY_THRESHOLD]),
      query('SELECT COUNT(DISTINCT contributor_hash)::int AS total FROM pattern_contributions'),
      query(
        `SELECT category, COUNT(*)::int AS count
         FROM community_patterns
         WHERE contributor_count >= $1
         GROUP BY category
         ORDER BY count DESC
         LIMIT 10`,
        [K_ANONYMITY_THRESHOLD]
      ),
    ]);

    res.json({
      totalPatterns: patternsResult.rows[0]?.total || 0,
      totalContributors: contributorsResult.rows[0]?.total || 0,
      topCategories: categoriesResult.rows,
      lastUpdated: Date.now(),
    });
  } catch (err: any) {
    console.error('Federation stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function dedupHash(category: string, approach: string): string {
  const normalised = `${category}:${approach.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()}`;
  return createHash('sha256').update(normalised).digest('hex');
}

function rowToPattern(row: any) {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    platform: row.platform,
    approach: row.approach,
    tags: row.tags || [],
    effectiveness: parseFloat(row.effectiveness),
    contributorCount: row.contributor_count,
    firstSeen: new Date(row.first_seen).getTime(),
    lastSeen: new Date(row.last_seen).getTime(),
  };
}
