import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export async function renderMarkdown(markdown: string): Promise<string> {
	const rendered = await marked.parse(markdown, { gfm: true });
	return sanitizeHtml(rendered, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
		allowedAttributes: {
			...sanitizeHtml.defaults.allowedAttributes,
			a: ['href', 'name', 'target', 'rel'],
			img: ['src', 'alt', 'title', 'width', 'height', 'loading']
		},
		allowedSchemes: ['http', 'https', 'mailto'],
		transformTags: {
			a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
			img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }, true)
		}
	});
}

export function titleFromMarkdown(markdown: string, fallback: string): string {
	const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
	return heading || fallback;
}

export function excerptFromMarkdown(markdown: string): string {
	return markdown
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[`*_>~-]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 220);
}

export function slugify(value: string): string {
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9\u3400-\u9fff]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80) || `gem-${Date.now()}`;
}
