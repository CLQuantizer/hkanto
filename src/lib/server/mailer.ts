const DEFAULT_FROM = 'noreply@mywords.io';

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Sends a short email with one link through Cloudflare Email Service.
 * Returns false instead of throwing, so callers can show a calm message.
 */
export async function sendLinkEmail(
	env: App.Platform['env'] | undefined,
	message: { to: string; subject: string; intro: string; linkLabel: string; link: string; outro: string }
): Promise<boolean> {
	if (!env?.EMAIL) return false;
	try {
		await env.EMAIL.send({
			to: message.to,
			from: { email: env.MAIL_FROM ?? DEFAULT_FROM, name: '講粵語' },
			subject: message.subject,
			text: `${message.intro}\n\n${message.link}\n\n${message.outro}\n\n講粵語 · hk.mywords.io`,
			html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:32rem;color:#2d2823;line-height:1.6">
<p style="display:inline-block;background:#b42f24;color:#fbf8f3;font-weight:700;padding:0.3rem 0.55rem;margin:0 0 1.2rem">講</p>
<p>${escapeHtml(message.intro)}</p>
<p><a href="${escapeHtml(message.link)}" style="display:inline-block;background:#2d2823;color:#fbf8f3;padding:0.7rem 1.1rem;text-decoration:none;font-weight:600">${escapeHtml(message.linkLabel)}</a></p>
<p style="color:#75685d;font-size:0.9rem">${escapeHtml(message.outro)}</p>
<p style="color:#75685d;font-size:0.8rem">講粵語 · hk.mywords.io</p></div>`
		});
		return true;
	} catch (cause) {
		const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'unknown';
		console.error({ event: 'email_send_failed', code, message: cause instanceof Error ? cause.message : String(cause) });
		return false;
	}
}
