-- Add tags column to posts table for tag bridge
-- Run this if posts table already exists from 003_create_community.sql

ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '';
