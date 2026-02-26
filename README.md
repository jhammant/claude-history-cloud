# Claude History Cloud

Multi-user SaaS backend for [ClaudeHistoryMCP](https://github.com/jhammant/claude-history-mcp). Provides cloud sync, team knowledge sharing, and federated community patterns.

## Features

- **Auth**: Email/password registration, JWT tokens (7-day expiry), API key access
- **Knowledge CRUD**: Create, read, update, delete knowledge entries with full-text search
- **Session Summaries**: Push/pull session summaries across machines
- **Teams**: Create teams, invite members, share knowledge within teams
- **Cloud Sync**: Push/pull endpoints for the MCP sync client
- **Federation**: Anonymous community pattern sharing with k-anonymity
- **Usage Tracking**: Per-user stats and tier-based limits

## API

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

## Setup

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your JWT_SECRET
docker compose up -d
```

### Manual

```bash
npm install
# Set up PostgreSQL and run migrations
psql $DATABASE_URL < migrations/001_initial.sql
psql $DATABASE_URL < migrations/002_federation.sql
npm run build
npm start
```

### Railway

Click deploy or use the Railway CLI:
```bash
railway up
```

## Auth

All endpoints except `/health`, `/api/auth/register`, `/api/auth/login`, and `/api/federation/*` require authentication.

Use either:
- **JWT token**: `Authorization: Bearer <jwt_token>`
- **API key**: `Authorization: Bearer <64_char_hex_api_key>`

## Tiers

| Tier | Knowledge Entries | Team Members | Rate Limit |
|------|-------------------|--------------|------------|
| Free | 500 | 0 | 30/min |
| Pro | 10,000 | 0 | 120/min |
| Team | 50,000 | 50 | 300/min |

## License

Private — not open source.
