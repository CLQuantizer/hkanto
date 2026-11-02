ALTER TABLE translation_history ADD COLUMN source_text TEXT NOT NULL DEFAULT '';
ALTER TABLE translation_history ADD COLUMN source_language TEXT NOT NULL DEFAULT 'en';

UPDATE translation_history
SET source_text = english,
	source_language = 'en'
WHERE source_text = '';
