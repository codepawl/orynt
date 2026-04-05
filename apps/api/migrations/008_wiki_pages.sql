-- 008: Wiki pages for project documentation
-- Run in Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS wiki_pages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_slug TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_format TEXT DEFAULT 'markdown'
        CHECK (content_format IN ('markdown', 'html')),
    parent_id UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_slug, slug)
);

-- ── Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wiki_project ON wiki_pages(project_slug, sort_order);
CREATE INDEX IF NOT EXISTS idx_wiki_parent ON wiki_pages(parent_id);

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiki pages readable by everyone"
    ON wiki_pages FOR SELECT USING (is_published = true);
CREATE POLICY "Authenticated users can create wiki pages"
    ON wiki_pages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authors and admins can update wiki pages"
    ON wiki_pages FOR UPDATE USING (
        auth.uid() = author_id OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "Admins can delete wiki pages"
    ON wiki_pages FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ── Trigger ────────────────────────────────────────────────────────

CREATE TRIGGER wiki_pages_updated_at
    BEFORE UPDATE ON wiki_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
