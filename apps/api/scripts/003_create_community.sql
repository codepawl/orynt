-- Community MVP — Posts, Comments, Votes, Flags
-- Run this in the Supabase SQL Editor after 002_create_profiles.sql

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) NOT NULL,
    type TEXT CHECK (type IN ('link', 'text', 'show')) NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    content TEXT,
    score INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    is_auto BOOLEAN DEFAULT false,
    source_article_id UUID REFERENCES articles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_score_created ON posts (score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts (author_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts (type);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at DESC);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
    parent_id UUID REFERENCES comments(id),
    author_id UUID REFERENCES profiles(id) NOT NULL,
    content TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments (author_id);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
    user_id UUID REFERENCES profiles(id) NOT NULL,
    target_id UUID NOT NULL,
    target_type TEXT CHECK (target_type IN ('post', 'comment')) NOT NULL,
    value INTEGER CHECK (value IN (1, -1)) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_votes_target ON votes (target_id, target_type);

-- Flags table (for moderation)
CREATE TABLE IF NOT EXISTS flags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reporter_id UUID REFERENCES profiles(id) NOT NULL,
    target_id UUID NOT NULL,
    target_type TEXT CHECK (target_type IN ('post', 'comment')) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (reporter_id, target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_flags_status ON flags (status);
CREATE INDEX IF NOT EXISTS idx_flags_target ON flags (target_id, target_type);

-- Updated_at trigger for posts
DROP TRIGGER IF EXISTS posts_updated_at ON posts;
CREATE TRIGGER posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS policies

-- Posts: public read, authenticated write
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Posts are viewable by everyone"
    ON posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create posts"
    ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own posts"
    ON posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own posts"
    ON posts FOR DELETE USING (auth.uid() = author_id);

-- Comments: public read, authenticated write
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are viewable by everyone"
    ON comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create comments"
    ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own comments"
    ON comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own comments"
    ON comments FOR DELETE USING (auth.uid() = author_id);

-- Votes: public read, authenticated write
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Votes are viewable by everyone"
    ON votes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote"
    ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change own votes"
    ON votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove own votes"
    ON votes FOR DELETE USING (auth.uid() = user_id);

-- Flags: users can create, only admins can read all
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create flags"
    ON flags FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can see own flags"
    ON flags FOR SELECT USING (auth.uid() = reporter_id);

-- Helper: increment comment count on a post
CREATE OR REPLACE FUNCTION increment_comment_count(post_id_input UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = post_id_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ranking function: HN-style score
-- score = (upvotes - 1) / pow(age_hours + 2, 1.8)
CREATE OR REPLACE FUNCTION calculate_rank(post_score INTEGER, post_created_at TIMESTAMPTZ)
RETURNS FLOAT AS $$
BEGIN
    RETURN (GREATEST(post_score, 0)::FLOAT) /
           POWER(EXTRACT(EPOCH FROM (now() - post_created_at)) / 3600.0 + 2.0, 1.8);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
