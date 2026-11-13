-- Migration 0002: Optional base64 fallback on MediaAssets when R2 bucket is not yet enabled
ALTER TABLE MediaAssets ADD COLUMN DataBase64 TEXT;
