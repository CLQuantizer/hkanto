export async function readJson(response: Response): Promise<unknown> {
	const payload = (await response.json().catch(() => null)) as { message?: string } | null;
	if (!response.ok) throw new Error(payload?.message ?? `Request failed (${response.status})`);
	return payload;
}

export function passkeyError(err: unknown, fallback: string): string {
	if (err instanceof Error) {
		if (err.name === 'NotAllowedError') return 'The passkey prompt was closed, or this device has no passkey for this site. You can use a password instead.';
		if (err.name === 'InvalidStateError') return 'That passkey is already saved on this account.';
		if (err.name === 'SecurityError') return 'Passkeys need localhost or HTTPS.';
		if (err.message) return err.message;
	}
	return fallback;
}
