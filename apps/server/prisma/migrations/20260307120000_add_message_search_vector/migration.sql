-- Add tsvector column for full-text search
ALTER TABLE "messages" ADD COLUMN "search_vector" tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX "idx_messages_search" ON "messages" USING GIN("search_vector");

-- Trigger function to automatically update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION messages_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" := to_tsvector('simple', COALESCE(NEW."content", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_search_update
  BEFORE INSERT OR UPDATE OF "content" ON "messages"
  FOR EACH ROW EXECUTE FUNCTION messages_search_trigger();

-- Backfill existing messages
UPDATE "messages" SET "search_vector" = to_tsvector('simple', COALESCE("content", ''));
