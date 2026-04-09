-- Add prd_content column to store AI-authored PRD markdown per module
ALTER TABLE modules ADD COLUMN prd_content text NOT NULL DEFAULT '';
