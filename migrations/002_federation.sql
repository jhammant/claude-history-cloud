-- Federation: Community Patterns
-- Anonymous, generalised patterns contributed by the community.
-- K-anonymity enforced: patterns only visible when contributor_count >= 3.

CREATE TABLE IF NOT EXISTS community_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('solution', 'error_fix', 'decision', 'pattern')),
  category VARCHAR(255) NOT NULL,
  platform VARCHAR(255),
  approach TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  effectiveness NUMERIC(3,2) DEFAULT 0.50 CHECK (effectiveness >= 0 AND effectiveness <= 1),
  contributor_count INT DEFAULT 1 CHECK (contributor_count >= 0),
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  hash VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pattern_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES community_patterns(id) ON DELETE CASCADE,
  contributor_hash VARCHAR(64) NOT NULL,
  contributed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pattern_id, contributor_hash)
);

CREATE INDEX IF NOT EXISTS idx_patterns_category ON community_patterns(category);
CREATE INDEX IF NOT EXISTS idx_patterns_platform ON community_patterns(platform);
CREATE INDEX IF NOT EXISTS idx_patterns_tags ON community_patterns USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_patterns_effectiveness ON community_patterns(effectiveness DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON community_patterns(type);
CREATE INDEX IF NOT EXISTS idx_patterns_hash ON community_patterns(hash);
CREATE INDEX IF NOT EXISTS idx_contributions_pattern ON pattern_contributions(pattern_id);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor ON pattern_contributions(contributor_hash);

-- Full-text search index on approach + category
ALTER TABLE community_patterns ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(category, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(approach, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(platform, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_patterns_search ON community_patterns USING GIN(search_vector);
