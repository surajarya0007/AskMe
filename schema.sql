-- =========================================================================
-- AskMe Database Schema (PostgreSQL Document-Store Style)
-- Copy and paste this script into the SQL Editor in your Supabase Dashboard
-- =========================================================================

-- 1. Drop existing tables if they exist
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;

-- 2. Sessions Table (One row per unique user, containing all their chat titles)
CREATE TABLE sessions (
  user_email TEXT PRIMARY KEY,
  titles TEXT[] NOT NULL DEFAULT '{}'::text[]
);

-- 3. Messages Table (One row per unique chat title per user, containing all messages)
CREATE TABLE messages (
  user_email TEXT NOT NULL,
  chat_title TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (user_email, chat_title)
);
