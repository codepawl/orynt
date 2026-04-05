-- 007: Papers & Reproductions tables for Reproduce & Verify feature
-- Run in Supabase Dashboard > SQL Editor

-- ── Papers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS papers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '',
    arxiv_url TEXT,
    pdf_url TEXT,
    venue TEXT,
    year INTEGER,
    abstract TEXT,
    tags TEXT DEFAULT '',
    submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verification_status TEXT DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'verified', 'partially_reproduced', 'disputed')),
    reproduction_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Reproductions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reproductions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    paper_id UUID REFERENCES papers(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    result TEXT NOT NULL
        CHECK (result IN ('confirmed', 'partially', 'failed', 'different_findings')),
    hardware TEXT,
    framework TEXT,
    model_tested TEXT,
    summary TEXT NOT NULL CHECK (char_length(summary) <= 500),
    details TEXT,
    code_url TEXT,
    paper_claims JSONB DEFAULT '[]'::jsonb,
    actual_results JSONB DEFAULT '[]'::jsonb,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(verification_status);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reproductions_paper ON reproductions(paper_id);
CREATE INDEX IF NOT EXISTS idx_reproductions_author ON reproductions(author_id);
CREATE INDEX IF NOT EXISTS idx_reproductions_result ON reproductions(result);

-- ── Extend votes & flags for reproduction target type ──────────────

ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_target_type_check;
ALTER TABLE votes ADD CONSTRAINT votes_target_type_check
    CHECK (target_type IN ('post', 'comment', 'reproduction'));

ALTER TABLE flags DROP CONSTRAINT IF EXISTS flags_target_type_check;
ALTER TABLE flags ADD CONSTRAINT flags_target_type_check
    CHECK (target_type IN ('post', 'comment', 'reproduction'));

-- ── RLS policies ───────────────────────────────────────────────────

ALTER TABLE papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Papers readable by everyone"
    ON papers FOR SELECT USING (true);
CREATE POLICY "Authenticated users can submit papers"
    ON papers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authors can update own papers"
    ON papers FOR UPDATE USING (auth.uid() = submitted_by);
CREATE POLICY "Authors can delete own papers"
    ON papers FOR DELETE USING (auth.uid() = submitted_by);

ALTER TABLE reproductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reproductions readable by everyone"
    ON reproductions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can submit reproductions"
    ON reproductions FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own reproductions"
    ON reproductions FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own reproductions"
    ON reproductions FOR DELETE USING (auth.uid() = author_id);

-- ── Triggers ───────────────────────────────────────────────────────
-- update_updated_at_column() may already exist from blog_posts migration.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER papers_updated_at
    BEFORE UPDATE ON papers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER reproductions_updated_at
    BEFORE UPDATE ON reproductions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
