-- News Automation Pipeline — Supabase Tables
-- Run this in the Supabase SQL Editor

-- Feeds table
CREATE TABLE IF NOT EXISTS feeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    fetch_interval_minutes INT DEFAULT 60,
    last_fetched_at TIMESTAMPTZ,
    error_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id UUID REFERENCES feeds(id) ON DELETE SET NULL,

    -- Original content from RSS
    original_title TEXT NOT NULL,
    original_url TEXT NOT NULL UNIQUE,
    original_summary TEXT,
    original_author TEXT,
    original_published_at TIMESTAMPTZ,

    -- Processed content for /news rendering
    slug TEXT UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    tags TEXT DEFAULT '',
    image_url TEXT,

    -- SEO
    meta_title TEXT,
    meta_description TEXT,
    canonical_url TEXT,

    -- Dedup
    title_hash TEXT NOT NULL,

    -- Status workflow: draft -> review -> published | rejected | archived
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'rejected', 'archived')),

    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT now(),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_title_hash ON articles(title_hash);
CREATE INDEX IF NOT EXISTS idx_articles_original_url ON articles(original_url);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    article_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Article-Tags junction table
CREATE TABLE IF NOT EXISTS article_tags (
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, tag_id)
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_updated_at ON articles;
CREATE TRIGGER articles_updated_at
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Seed default RSS feeds
INSERT INTO feeds (name, url, category) VALUES
    ('HuggingFace Blog', 'https://huggingface.co/blog/feed.xml', 'tools'),
    ('Google AI Blog', 'https://blog.google/technology/ai/rss/', 'research'),
    ('OpenAI Blog', 'https://openai.com/blog/rss.xml', 'research'),
    ('Anthropic News', 'https://www.anthropic.com/rss.xml', 'research'),
    ('MIT Tech Review AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', 'industry'),
    ('The Batch', 'https://www.deeplearning.ai/the-batch/feed/', 'industry'),
    ('Arxiv cs.AI', 'http://export.arxiv.org/rss/cs.AI', 'research'),
    ('Arxiv cs.CL', 'http://export.arxiv.org/rss/cs.CL', 'research'),
    ('Arxiv cs.LG', 'http://export.arxiv.org/rss/cs.LG', 'research'),
    ('Meta AI Blog', 'https://ai.meta.com/blog/rss/', 'research'),
    ('NVIDIA AI Blog', 'https://blogs.nvidia.com/feed/', 'hardware'),
    ('Towards Data Science', 'https://towardsdatascience.com/feed', 'tutorials'),
    ('Machine Learning Mastery', 'https://machinelearningmastery.com/feed/', 'tutorials')
ON CONFLICT (url) DO NOTHING;
