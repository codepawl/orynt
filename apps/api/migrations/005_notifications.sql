-- Phase 4.1: Notifications system
-- Run in Supabase SQL Editor

CREATE TABLE notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text CHECK (type IN ('comment_reply', 'post_comment', 'vote')) NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX notifications_user_unread ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System can insert notifications (service role)
CREATE POLICY "Service can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
