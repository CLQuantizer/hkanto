import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readArticles } from './reading-data.mjs';
import { jyutpingToYale } from '../src/lib/romanization.ts';

const ROOT = resolve(import.meta.dirname, '..');
const annotations = JSON.parse(await readFile(resolve(ROOT, 'data/reading-annotations.json'), 'utf8'));
const articles = await readArticles();
const batch = [];
for (const article of articles) {
	batch.push({
		sql: `INSERT INTO reading_articles (slug, title, genre, source_path, content_hash, sort_rank) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
		 ON CONFLICT(slug) DO UPDATE SET title=excluded.title, genre=excluded.genre, source_path=excluded.source_path,
		 content_hash=excluded.content_hash, sort_rank=excluded.sort_rank`,
		params: [article.slug, article.title, article.genre, article.sourcePath, article.contentHash, article.rank ?? 1000]
	});
	batch.push({ sql: 'DELETE FROM reading_article_sentences WHERE article_slug = ?1', params: [article.slug] });
	for (const sentence of article.occurrences) {
		const annotation = annotations[sentence.id];
		if (!annotation?.jyutping) throw new Error(`Missing romanization for ${sentence.id}`);
		batch.push({
			sql: `INSERT INTO reading_sentences (id, cantonese, jyutping, yale, annotation_model) VALUES (?1, ?2, ?3, ?4, ?5)
			 ON CONFLICT(id) DO UPDATE SET cantonese=excluded.cantonese, jyutping=excluded.jyutping,
			 yale=excluded.yale, annotation_model=excluded.annotation_model
			 WHERE reading_sentences.annotation_model IS NOT 'admin'`,
			params: [sentence.id, sentence.cantonese, annotation.jyutping, jyutpingToYale(annotation.jyutping), annotation.model]
		});
		batch.push({
			sql: 'INSERT INTO reading_article_sentences (article_slug, position, paragraph_index, sentence_id) VALUES (?1, ?2, ?3, ?4)',
			params: [article.slug, sentence.position, sentence.paragraphIndex, sentence.id]
		});
	}
}
const output = resolve(ROOT, 'data/reading-seed.batch.json');
await writeFile(output, JSON.stringify(batch, null, 2) + '\n');
console.log(`${batch.length} D1 statements written to ${output}`);
