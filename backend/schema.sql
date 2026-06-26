-- ============================================================
-- OPERATIUM – Supabase SQL Schema
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- KNOWLEDGE BASE (pgvector RAG) — Role-Based Production Schema
--
-- doc_type values:
--   'general'   → YC essays, PM/VC/System-Design frameworks
--   'startup'   → per-startup memory: meetings, decisions, reports, timeline
--
-- role values (executive role that benefits most from this doc):
--   'CEO' | 'CTO' | 'Product Manager' | 'Product Designer' |
--   'Growth & Marketing' | 'Finance & Operations' | 'Investor & Risk Advisor' | 'all'
-- ============================================================

-- ── Migration: extend existing table if it exists ────────────────────────────
-- (Safe to re-run — uses IF NOT EXISTS / DO NOTHING patterns)
DO $$
BEGIN
  -- Add role column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='role'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN role TEXT NOT NULL DEFAULT 'all';
  END IF;

  -- Add source column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='source'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN source TEXT;
  END IF;

  -- Add tags column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='tags'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN tags TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Add startup_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='startup_id'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN startup_id UUID;
  END IF;

  -- Add chunk_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='chunk_id'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN chunk_id TEXT;
  END IF;

  -- Add doc_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='doc_type'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN doc_type TEXT NOT NULL DEFAULT 'general';
  END IF;

  -- Add created_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='created_at'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='knowledge_base' AND column_name='updated_at'
  ) THEN
    ALTER TABLE knowledge_base ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ── Create table from scratch if it does not exist ───────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_base (
  id          BIGSERIAL    PRIMARY KEY,
  content     TEXT         NOT NULL,
  embedding   VECTOR(768)  NOT NULL,   -- gemini-embedding-2 @ 768-dim MRL
  metadata    JSONB        NOT NULL DEFAULT '{}',

  -- Role-based fields
  role        TEXT         NOT NULL DEFAULT 'all',  -- executive role filter
  source      TEXT,                                 -- filename / URL / slug
  tags        TEXT[]       DEFAULT ARRAY[]::TEXT[], -- topic tags
  doc_type    TEXT         NOT NULL DEFAULT 'general', -- 'general' | 'startup'
  startup_id  UUID,                                 -- NULL for general docs

  -- Chunking traceability
  chunk_id    TEXT,   -- e.g. "pg_essays_do_things:0", "pg_essays_do_things:1"

  -- Timestamps
  created_at  TIMESTAMPTZ  DEFAULT now(),
  updated_at  TIMESTAMPTZ  DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- HNSW index for vector similarity search (max 2000 dims — we use 768)
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- B-tree indexes for role/startup_id filtering (fast WHERE clauses)
CREATE INDEX IF NOT EXISTS knowledge_base_role_idx
  ON knowledge_base (role);

CREATE INDEX IF NOT EXISTS knowledge_base_startup_id_idx
  ON knowledge_base (startup_id);

CREATE INDEX IF NOT EXISTS knowledge_base_doc_type_idx
  ON knowledge_base (doc_type);

CREATE INDEX IF NOT EXISTS knowledge_base_source_idx
  ON knowledge_base (source);

-- ── RPC v1: legacy — kept for backward compatibility ─────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding VECTOR(768),
  match_count     INT   DEFAULT 5,
  filter          JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id         BIGINT,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE (filter = '{}' OR kb.metadata @> filter)
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── RPC v2: role-aware retrieval (called by the new retrieve_docs()) ──────────
-- Supports:
--   role filter  : returns docs for this role OR 'all'
--   startup_id   : returns startup-specific memory if provided
--   doc_type     : 'general' | 'startup' | NULL (both)
CREATE OR REPLACE FUNCTION match_knowledge_v2(
  query_embedding VECTOR(768),
  p_role          TEXT    DEFAULT NULL,
  p_startup_id    UUID    DEFAULT NULL,
  p_doc_type      TEXT    DEFAULT NULL,
  match_count     INT     DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id         BIGINT,
  content    TEXT,
  metadata   JSONB,
  role       TEXT,
  source     TEXT,
  tags       TEXT[],
  doc_type   TEXT,
  startup_id UUID,
  chunk_id   TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.metadata,
    kb.role,
    kb.source,
    kb.tags,
    kb.doc_type,
    kb.startup_id,
    kb.chunk_id,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    -- Role filter: match specific role OR 'all' docs
    (p_role IS NULL OR kb.role = p_role OR kb.role = 'all')
    -- Startup filter
    AND (p_startup_id IS NULL OR kb.startup_id = p_startup_id)
    -- Doc type filter
    AND (p_doc_type IS NULL OR kb.doc_type = p_doc_type)
    -- Similarity threshold
    AND (1 - (kb.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── Auto-update updated_at trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_knowledge_base_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_base_updated_at();



-- ============================================================
-- STARTUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS startups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  industry TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'idea',
  validation_score INTEGER DEFAULT 0,
  executives TEXT[] DEFAULT ARRAY['CEO','CTO','Product Manager','Product Designer','Growth & Marketing','Finance & Operations','Investor & Risk Advisor'],
  meeting_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MEETINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  meeting_type TEXT NOT NULL DEFAULT 'full_board',
  executives TEXT[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- MEETING MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  executive_role TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'analysis',
  stage TEXT NOT NULL DEFAULT 'analysis',
  sequence_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'full',
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- DECISIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  decision_text TEXT NOT NULL,
  made_by TEXT NOT NULL,
  decision_type TEXT DEFAULT 'recommendation',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FOLLOW-UP QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS followup_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id UUID REFERENCES startups(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_meetings_startup_id ON meetings(startup_id);
CREATE INDEX IF NOT EXISTS idx_messages_meeting_id ON meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_reports_startup_id ON reports(startup_id);
CREATE INDEX IF NOT EXISTS idx_decisions_startup_id ON decisions(startup_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_startups_updated_at
  BEFORE UPDATE ON startups
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (open for now, no auth)
-- ============================================================
ALTER TABLE startups ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_questions ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth in Phase 2A)
CREATE POLICY "Allow all on startups" ON startups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on messages" ON meeting_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on reports" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on decisions" ON decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on followups" ON followup_questions FOR ALL USING (true) WITH CHECK (true);
