# ClaudeHistory Cloud

> The sync and collaboration server for [ClaudeHistory MCP](https://github.com/jhammant/claude-history-mcp).

Self-host for free, or use our managed version (coming soon).

## What This Does

ClaudeHistory MCP runs locally and gives Claude Code persistent memory. **This server** adds:

- **Cross-device sync** — your knowledge follows you between machines
- **Team sharing** — when your colleague solves a problem, everyone's Claude learns
- **Community patterns** — opt-in anonymous pattern sharing across the community

## How It Fits Together

```
Your Machine                          Server (self-hosted or managed)
┌──────────────────────┐             ┌──────────────────────────┐
│ Claude Code          │             │ ClaudeHistory Cloud      │
│   ↕                  │             │                          │
│ ClaudeHistory MCP    │────sync────▶│ PostgreSQL               │
│   ↕                  │  patterns   │ Knowledge Store          │
│ ~/.claude/projects/  │  only       │ Team Management          │
│ (your sessions)      │             │ Federation Hub           │
└──────────────────────┘             └──────────────────────────┘
        │                                       │
   Raw transcripts                     Only extracted patterns:
   stay HERE.                          decisions, solutions,
   Never sent.                         error→fix mappings.
```

**What syncs:** Structured knowledge entries (decisions, solutions, error→fix patterns).
**What never syncs:** Raw conversation text, source code, file paths, secrets.

## Quick Start (Self-Host)

```bash
git clone https://github.com/jhammant/claude-history-cloud
cd claude-history-cloud
cp .env.example .env    # edit JWT_SECRET at minimum
docker compose up -d
```

This starts PostgreSQL + the API server on port 3000.

Then configure your MCP client:

```bash
export CLAUDE_HISTORY_API_URL=http://localhost:3000
export CLAUDE_HISTORY_API_KEY=your-api-key  # generated after registration
```

### Register and Get an API Key

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'

# Login (returns JWT)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password"}'

# Generate API key (use JWT from login)
curl -X POST http://localhost:3000/api/auth/api-key \
  -H "Authorization: Bearer <your-jwt>"
```

## Features

### 🔐 Authentication
- JWT tokens (7-day expiry) for web/dashboard access
- API keys (64-char hex, never expire) for MCP client
- bcrypt password hashing (12 rounds)

### 👥 Teams
- Create teams, invite members by email
- Shared knowledge pool — everyone's Claude learns from the team
- E2E encrypted sync

### 🔄 Knowledge Sync
- Push/pull API for the MCP client
- Timestamp-based incremental sync (`?since=<ISO timestamp>`)
- Bulk operations for efficiency

### 🌐 Federation (Opt-in)
- Anonymous pattern contribution with differential privacy
- K-anonymity threshold: patterns only surface when 3+ independent contributors share the same pattern
- Your code never leaves your machine — only generalised patterns

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login, get JWT |
| POST | `/api/auth/api-key` | JWT | Generate API key |
| GET | `/api/auth/me` | JWT/Key | Current user info |

### Knowledge
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/knowledge` | JWT/Key | Create entry |
| GET | `/api/knowledge` | JWT/Key | List entries (paginated) |
| GET | `/api/knowledge/search?q=` | JWT/Key | Full-text search |
| GET | `/api/knowledge/:id` | JWT/Key | Get single entry |
| PATCH | `/api/knowledge/:id` | JWT/Key | Update entry |
| DELETE | `/api/knowledge/:id` | JWT/Key | Delete entry |

### Sessions
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/sessions` | JWT/Key | Push session summary |
| GET | `/api/sessions` | JWT/Key | List summaries |
| GET | `/api/sessions/:sessionId` | JWT/Key | Get single summary |

### Teams
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/teams` | JWT/Key | Create team |
| GET | `/api/teams` | JWT/Key | List your teams |
| POST | `/api/teams/:id/invite` | JWT/Key | Invite member by email |
| GET | `/api/teams/:id/members` | JWT/Key | List members |
| DELETE | `/api/teams/:id/members/:userId` | JWT/Key | Remove member |

### Sync (MCP Client)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/sync/push/knowledge` | Key | Bulk push knowledge |
| POST | `/api/sync/push/sessions` | Key | Bulk push session summaries |
| GET | `/api/sync/pull/knowledge?since=` | Key | Pull new knowledge |
| GET | `/api/sync/pull/sessions?since=` | Key | Pull new sessions |

### Federation
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/federation/contribute` | Key | Submit anonymous patterns |
| GET | `/api/federation/patterns` | None | List community patterns |
| GET | `/api/federation/patterns/search?q=` | None | Search patterns |
| GET | `/api/federation/stats` | None | Community statistics |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Server health check |

## Deployment

### Docker Compose (Recommended)
```bash
docker compose up -d
```

### Manual
```bash
npm install
npm run build
npm start
```
Requires PostgreSQL 15+.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/claude_history` | PostgreSQL connection |
| `JWT_SECRET` | Yes | — | Secret for JWT signing (use `openssl rand -hex 32`) |
| `PORT` | No | `3100` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `JWT_EXPIRES_IN` | No | `7d` | JWT token expiry |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window |

## License

AGPL-3.0 — open source with copyleft. Self-hosting encouraged.

If you want to use this in a proprietary product, get in touch.
