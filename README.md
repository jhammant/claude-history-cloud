# ClaudeHistory Cloud

> The sync and collaboration server for [ClaudeHistoryMCP](https://github.com/jhammant/claude-history-mcp).

Self-host for free, or use our managed version at [claudehistory.com](https://claudehistory.com).

## Quick Start (Self-Host)

```bash
git clone https://github.com/jhammant/claude-history-cloud
cd claude-history-cloud
cp .env.example .env
# Edit .env with your settings
docker compose up -d
```

This starts PostgreSQL + the API server on port 3000.

## Features

- **User auth** — JWT + API key authentication
- **Team management** — Create teams, invite members, shared knowledge
- **Knowledge sync** — Push/pull knowledge entries and session summaries
- **Federated hub** — Community pattern sharing with k-anonymity
- **Usage tracking** — Per-user/team usage stats and tier-based limits
- **Self-host ready** — Docker Compose, works anywhere

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with email + password |
| POST | `/api/auth/login` | Login, get JWT token |
| POST | `/api/auth/api-key` | Generate new API key (auth required) |
| GET | `/api/auth/me` | Get current user info |

### Knowledge

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/knowledge` | Create knowledge entry |
| GET | `/api/knowledge` | List entries (with pagination) |
| GET | `/api/knowledge/search?q=` | Full-text search |
| GET | `/api/knowledge/:id` | Get single entry |
| PATCH | `/api/knowledge/:id` | Update entry |
| DELETE | `/api/knowledge/:id` | Delete entry |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Push session summary |
| GET | `/api/sessions` | List summaries |
| GET | `/api/sessions/:sessionId` | Get single summary |

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/teams` | Create team |
| GET | `/api/teams` | List your teams |
| POST | `/api/teams/:id/invite` | Invite member by email |
| GET | `/api/teams/:id/members` | List members |
| DELETE | `/api/teams/:id/members/:userId` | Remove member |

### Sync (for MCP client)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/push/knowledge` | Bulk push knowledge entries |
| POST | `/api/sync/push/sessions` | Bulk push session summaries |
| GET | `/api/sync/pull/knowledge` | Pull knowledge (with `?since=` timestamp) |
| GET | `/api/sync/pull/sessions` | Pull sessions (with `?since=` timestamp) |

### Federation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/federation/contribute` | Submit anonymous patterns |
| GET | `/api/federation/patterns` | List community patterns |
| GET | `/api/federation/patterns/search?q=` | Search patterns |
| GET | `/api/federation/stats` | Community statistics |

### Usage

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/usage` | Get usage stats + tier limits |

### Authentication

All endpoints except `/health`, `/api/auth/register`, `/api/auth/login`, and `/api/federation/*` require authentication via:
- **JWT token**: `Authorization: Bearer <jwt_token>`
- **API key**: `Authorization: Bearer <64_char_hex_api_key>`

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

Requires PostgreSQL 15+ with pgvector extension.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/claude_history` |
| `JWT_SECRET` | Secret for signing JWT tokens | *required* |
| `JWT_EXPIRES_IN` | JWT token expiry | `7d` |
| `PORT` | Server port | `3100` |
| `NODE_ENV` | Environment (`development` / `production`) | `development` |
| `STRIPE_SECRET_KEY` | Stripe secret key (for paid tiers) | — |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | — |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `60000` |
| `RATE_LIMIT_MAX_FREE` | Requests per window (free tier) | `30` |
| `RATE_LIMIT_MAX_PRO` | Requests per window (pro tier) | `120` |
| `RATE_LIMIT_MAX_TEAM` | Requests per window (team tier) | `300` |

## License

AGPL-3.0 — open source with copyleft. Self-hosting encouraged.
See [LICENSE](LICENSE) for details.
