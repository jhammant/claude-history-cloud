import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { resetDb } from './setup.js';

// Must set env before importing app
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/claude_history_test';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// Dynamic import so env is set first
let app: any;
beforeAll(async () => {
  const mod = await import('../src/index.js');
  app = mod.default;
});

beforeEach(async () => {
  await resetDb();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function registerUser(email = 'test@example.com', password = 'password123') {
  const res = await request(app).post('/api/auth/register').send({ email, password });
  return { token: res.body.token, apiKey: res.body.apiKey, user: res.body.user };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Health ───────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  it('registers a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new@test.com');
    expect(res.body.user.tier).toBe('free');
    expect(res.body.token).toBeTruthy();
    expect(res.body.apiKey).toBeTruthy();
  });

  it('rejects duplicate email', async () => {
    await registerUser('dup@test.com');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials', async () => {
    await registerUser('login@test.com', 'mypassword1');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'mypassword1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    await registerUser('wrong@test.com', 'correctpass');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@test.com', password: 'wrongpass1' });
    expect(res.status).toBe(401);
  });

  it('GET /me returns current user with JWT', async () => {
    const { token } = await registerUser();
    const res = await request(app).get('/api/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });

  it('authenticates with API key', async () => {
    const { apiKey } = await registerUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${apiKey}` });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });

  it('generates a new API key', async () => {
    const { token, apiKey: oldKey } = await registerUser();
    const res = await request(app)
      .post('/api/auth/api-key')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.apiKey).toBeTruthy();
    expect(res.body.apiKey).not.toBe(oldKey);
  });

  it('rejects requests without auth', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ── Knowledge ────────────────────────────────────────────────────────────────

describe('Knowledge', () => {
  it('creates and retrieves a knowledge entry', async () => {
    const { token } = await registerUser();
    const entry = {
      type: 'decision',
      project: 'test-proj',
      summary: 'Use PostgreSQL for storage',
      details: 'Full-text search and JSONB support',
      tags: ['database'],
      timestamp: Date.now(),
    };

    const createRes = await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send(entry);
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();

    const getRes = await request(app)
      .get(`/api/knowledge/${createRes.body.id}`)
      .set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.summary).toBe('Use PostgreSQL for storage');
  });

  it('lists knowledge entries with pagination', async () => {
    const { token } = await registerUser();
    const ts = Date.now();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/knowledge')
        .set(authHeader(token))
        .send({ type: 'solution', summary: `Entry ${i}`, timestamp: ts + i });
    }

    const res = await request(app)
      .get('/api/knowledge?limit=2')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.total).toBe(3);
  });

  it('searches knowledge entries', async () => {
    const { token } = await registerUser();
    await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send({ type: 'solution', summary: 'Fixed CORS proxy error', timestamp: Date.now() });
    await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send({ type: 'decision', summary: 'Chose Redis for caching', timestamp: Date.now() });

    const res = await request(app)
      .get('/api/knowledge/search?q=CORS')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(res.body.entries[0].summary).toContain('CORS');
  });

  it('updates a knowledge entry', async () => {
    const { token } = await registerUser();
    const createRes = await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send({ type: 'solution', summary: 'Original', timestamp: Date.now() });

    const patchRes = await request(app)
      .patch(`/api/knowledge/${createRes.body.id}`)
      .set(authHeader(token))
      .send({ summary: 'Updated summary' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.updated).toBe(true);

    const getRes = await request(app)
      .get(`/api/knowledge/${createRes.body.id}`)
      .set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.summary).toBe('Updated summary');
  });

  it('deletes a knowledge entry', async () => {
    const { token } = await registerUser();
    const createRes = await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send({ type: 'solution', summary: 'To delete', timestamp: Date.now() });

    const res = await request(app)
      .delete(`/api/knowledge/${createRes.body.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/knowledge/${createRes.body.id}`)
      .set(authHeader(token));
    expect(getRes.status).toBe(404);
  });

  it('isolates entries between users', async () => {
    const user1 = await registerUser('user1@test.com');
    const user2 = await registerUser('user2@test.com');

    await request(app)
      .post('/api/knowledge')
      .set(authHeader(user1.token))
      .send({ type: 'solution', summary: 'User 1 only', timestamp: Date.now() });

    const res = await request(app)
      .get('/api/knowledge')
      .set(authHeader(user2.token));
    expect(res.body.entries).toHaveLength(0);
  });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

describe('Sessions', () => {
  it('creates and retrieves a session summary', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/sessions')
      .set(authHeader(token))
      .send({
        sessionId: 'sess-001',
        project: 'my-project',
        summary: { topics: ['auth', 'database'], decisions: ['Use JWT'] },
      });
    expect(res.status).toBe(201);

    const getRes = await request(app)
      .get('/api/sessions/sess-001')
      .set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body.summary.topics).toContain('auth');
  });

  it('upserts on duplicate sessionId', async () => {
    const { token } = await registerUser();
    await request(app)
      .post('/api/sessions')
      .set(authHeader(token))
      .send({ sessionId: 'dup-sess', summary: { v: 1 } });
    await request(app)
      .post('/api/sessions')
      .set(authHeader(token))
      .send({ sessionId: 'dup-sess', summary: { v: 2 } });

    const list = await request(app).get('/api/sessions').set(authHeader(token));
    expect(list.body.total).toBe(1);
    expect(list.body.summaries[0].summary.v).toBe(2);
  });
});

// ── Sync ─────────────────────────────────────────────────────────────────────

describe('Sync', () => {
  it('bulk pushes knowledge and pulls back', async () => {
    const { token } = await registerUser();
    const ts = Date.now();

    const pushRes = await request(app)
      .post('/api/sync/push/knowledge')
      .set(authHeader(token))
      .send({
        entries: [
          { type: 'solution', summary: 'Fix A', timestamp: ts },
          { type: 'decision', summary: 'Choose B', timestamp: ts + 1 },
        ],
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.accepted).toBe(2);

    const pullRes = await request(app)
      .get('/api/sync/pull/knowledge?since=0')
      .set(authHeader(token));
    expect(pullRes.status).toBe(200);
    expect(pullRes.body.entries).toHaveLength(2);
  });

  it('bulk pushes sessions', async () => {
    const { token } = await registerUser();

    const pushRes = await request(app)
      .post('/api/sync/push/sessions')
      .set(authHeader(token))
      .send({
        summaries: [
          { sessionId: 's1', summary: { topics: ['a'] } },
          { sessionId: 's2', summary: { topics: ['b'] } },
        ],
      });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.accepted).toBe(2);

    const pullRes = await request(app)
      .get('/api/sync/pull/sessions?since=0')
      .set(authHeader(token));
    expect(pullRes.body.summaries).toHaveLength(2);
  });
});

// ── Teams ────────────────────────────────────────────────────────────────────

describe('Teams', () => {
  it('creates a team and lists it', async () => {
    const { token } = await registerUser();
    const createRes = await request(app)
      .post('/api/teams')
      .set(authHeader(token))
      .send({ name: 'My Team' });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/teams').set(authHeader(token));
    expect(listRes.body.teams).toHaveLength(1);
    expect(listRes.body.teams[0].name).toBe('My Team');
  });

  it('rejects invite on free tier (0 team member limit)', async () => {
    const owner = await registerUser('owner@test.com');
    await registerUser('member@test.com');

    const team = await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ name: 'Collab Team' });
    const teamId = team.body.id;

    // Free tier has teamMembers: 0, so invite should be rejected
    const inviteRes = await request(app)
      .post(`/api/teams/${teamId}/invite`)
      .set(authHeader(owner.token))
      .send({ email: 'member@test.com' });
    expect(inviteRes.status).toBe(429);
    expect(inviteRes.body.error).toContain('limit');
  });

  it('prevents non-owner from inviting', async () => {
    const owner = await registerUser('owner2@test.com');
    const other = await registerUser('other@test.com');

    const team = await request(app)
      .post('/api/teams')
      .set(authHeader(owner.token))
      .send({ name: 'Private Team' });

    // Add other as member first
    await request(app)
      .post(`/api/teams/${team.body.id}/invite`)
      .set(authHeader(owner.token))
      .send({ email: 'other@test.com' });

    // Other tries to invite — should fail
    const res = await request(app)
      .post(`/api/teams/${team.body.id}/invite`)
      .set(authHeader(other.token))
      .send({ email: 'someone@test.com' });
    expect(res.status).toBe(403);
  });
});

// ── Usage ────────────────────────────────────────────────────────────────────

describe('Usage', () => {
  it('returns usage stats', async () => {
    const { token } = await registerUser();
    await request(app)
      .post('/api/knowledge')
      .set(authHeader(token))
      .send({ type: 'solution', summary: 'Test entry', timestamp: Date.now() });

    const res = await request(app).get('/api/usage').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.knowledgeEntries).toBe(1);
    expect(res.body.tier).toBe('free');
    expect(res.body.limits).toBeTruthy();
  });
});

// ── Federation ───────────────────────────────────────────────────────────────

describe('Federation', () => {
  const contributorHash = 'a'.repeat(64);

  function makePattern(overrides: Record<string, any> = {}) {
    return {
      id: crypto.randomUUID(),
      type: 'solution' as const,
      category: 'CORS',
      approach: 'Use proxy config in vite.config.ts to forward API requests',
      tags: ['cors', 'vite'],
      effectiveness: 0.9,
      contributorCount: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      ...overrides,
    };
  }

  it('accepts pattern contributions', async () => {
    const res = await request(app)
      .post('/api/federation/contribute')
      .send({
        contributorHash,
        patterns: [makePattern()],
      });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
  });

  it('merges duplicate patterns', async () => {
    const pattern = makePattern();

    await request(app)
      .post('/api/federation/contribute')
      .send({ contributorHash, patterns: [pattern] });

    const res = await request(app)
      .post('/api/federation/contribute')
      .send({ contributorHash: 'b'.repeat(64), patterns: [{ ...pattern, id: crypto.randomUUID() }] });
    expect(res.body.merged).toBe(1);
  });

  it('enforces k-anonymity on pattern listing', async () => {
    const pattern = makePattern();

    // Contribute from only 1 user — should not appear in listing
    await request(app)
      .post('/api/federation/contribute')
      .send({ contributorHash, patterns: [pattern] });

    const res = await request(app).get('/api/federation/patterns');
    expect(res.body.patterns).toHaveLength(0);

    // Contribute from 2 more users to reach k=3
    await request(app)
      .post('/api/federation/contribute')
      .send({ contributorHash: 'b'.repeat(64), patterns: [{ ...pattern, id: crypto.randomUUID() }] });
    await request(app)
      .post('/api/federation/contribute')
      .send({ contributorHash: 'c'.repeat(64), patterns: [{ ...pattern, id: crypto.randomUUID() }] });

    const res2 = await request(app).get('/api/federation/patterns');
    expect(res2.body.patterns.length).toBeGreaterThanOrEqual(1);
  });

  it('returns federation stats', async () => {
    const res = await request(app).get('/api/federation/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalPatterns');
    expect(res.body).toHaveProperty('totalContributors');
    expect(res.body).toHaveProperty('topCategories');
  });
});

// ── 404 ──────────────────────────────────────────────────────────────────────

describe('404', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
