-- Phase 5A: Blog posts table
-- Run in Supabase SQL Editor

CREATE TABLE blog_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text NOT NULL DEFAULT '',
  content_markdown text,
  summary text,
  cover_image_url text,
  tags text DEFAULT '',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published')),
  reading_time_minutes integer,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX blog_posts_slug ON blog_posts (slug);
CREATE INDEX blog_posts_author_id ON blog_posts (author_id);
CREATE INDEX blog_posts_status_published ON blog_posts (status, published_at DESC);

-- RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read for published posts
CREATE POLICY "Published blog posts are publicly readable"
  ON blog_posts FOR SELECT
  USING (status = 'published');

-- Authors can view all their own posts (any status)
CREATE POLICY "Authors can view own blog posts"
  ON blog_posts FOR SELECT
  USING (auth.uid() = author_id);

-- Authors can create drafts
CREATE POLICY "Authors can create blog posts"
  ON blog_posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors can update their own non-published posts
-- Published posts can only be updated by admin (via service role, bypasses RLS)
CREATE POLICY "Authors can update own draft or review posts"
  ON blog_posts FOR UPDATE
  USING (auth.uid() = author_id AND status IN ('draft', 'review'));

-- Authors can delete their own drafts/review posts
CREATE POLICY "Authors can delete own draft or review posts"
  ON blog_posts FOR DELETE
  USING (auth.uid() = author_id AND status IN ('draft', 'review'));

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_blog_post_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_blog_post_timestamp();
