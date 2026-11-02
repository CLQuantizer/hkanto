<script lang="ts">
	let { user, current }: { user: { displayName: string } | null; current: 'home' | 'tones' | 'reading' | null } = $props();
</script>

<div class="mb-3 flex items-center justify-between gap-2 sm:mb-4">
	<a
		href="/"
		class="flex min-w-0 items-center gap-3 text-xs font-semibold tracking-[0.12em] text-[var(--ink-muted)] uppercase no-underline sm:text-sm"
		aria-current={current === 'home' ? 'page' : undefined}
	>
		<span class="grid size-9 shrink-0 place-items-center bg-[var(--accent)] text-base tracking-normal text-[var(--paper)] normal-case">講</span>
		<span class="hidden truncate sm:inline">Hong Kong Cantonese</span>
	</a>
	<nav class="flex shrink-0 items-center gap-1" aria-label="Site">
		<a class="nav-link" href="/reading" aria-current={current === 'reading' ? 'page' : undefined}>Read</a>
		<a class="nav-link" href="/tones" aria-current={current === 'tones' ? 'page' : undefined}>Tones</a>
		<a class="nav-link github-link" href="https://github.com/CLQuantizer/hkanto" target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub">
			<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
		</a>
		<a class={['account-entry', { 'signed-in': Boolean(user) }]} href="/login" aria-label={user ? `Account for ${user.displayName}` : 'Sign in'}>
			{#if user}
				<span class="sm:hidden">Account</span>
				<span class="hidden sm:inline">{user.displayName}</span>
			{:else}
				Sign in
			{/if}
		</a>
	</nav>
</div>
