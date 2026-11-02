<script lang="ts">
	interface ToneExample {
		char: string;
		jyutping: string;
	}

	interface ToneRow {
		id: string;
		label: string;
		example: ToneExample;
		n: number;
		counts: number[];
	}

	let { id, title, description, rows, children }: {
		id: string;
		title: string;
		description: string;
		rows: ToneRow[];
		children?: import('svelte').Snippet;
	} = $props();

	const numberFormat = new Intl.NumberFormat('en-HK');
	let selected = $state<{ rowId: string; tone: number } | null>(null);

	function percent(count: number, total: number) {
		return total ? Math.round((count / total) * 100) : 0;
	}

	function modeIndex(counts: number[]) {
		return counts.reduce((best, count, index) => (count > counts[best] ? index : best), 0);
	}

	function cellPaint(share: number) {
		const scaled = Math.round(share * 1.5);
		// Stay in the two mixes where either ink or paper text clears WCAG AA.
		const hot = scaled >= 80;
		const amount = hot ? 100 : Math.min(68, scaled);
		return {
			background: `color-mix(in oklch, var(--accent) ${amount}%, var(--line))`,
			color: hot ? 'var(--paper)' : 'var(--ink)'
		};
	}

	const selectedRow = $derived(rows.find((row) => row.id === selected?.rowId) ?? null);
	const selectedCount = $derived(selectedRow && selected ? selectedRow.counts[selected.tone - 1] : 0);
	const selectedIsMode = $derived(
		selectedRow && selected ? modeIndex(selectedRow.counts) === selected.tone - 1 : false
	);
</script>

<section class="tone-chart" {id} aria-labelledby="{id}-heading">
	<div class="mb-4">
		<h2 id="{id}-heading" class="text-xl font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h2>
		<p class="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
	</div>

	<p class="tone-scroll-hint">Swipe sideways to see all six tones.</p>
	<div class="tone-scroll">
		<table>
			<caption class="sr-only">{title}. Each cell is the share of dictionary readings for that tone. A gold border marks the most common tone in the row.</caption>
			<thead>
				<tr>
					<th scope="col">Ending</th>
					{#each [1, 2, 3, 4, 5, 6] as tone (tone)}
						<th scope="col">Tone {tone}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr>
						<th scope="row">
							<span class="tone-final">{row.label}</span>
							<span class="tone-example"><span lang="zh-HK">{row.example.char}</span> <span lang="yue-Latn">{row.example.jyutping}</span></span>
							<span class="tone-sample">n={numberFormat.format(row.n)}</span>
						</th>
						{#each row.counts as count, index (index)}
							{@const share = percent(count, row.n)}
							{@const tone = index + 1}
							{@const isMode = modeIndex(row.counts) === index}
							{@const paint = cellPaint(share)}
							<td>
								<button
									type="button"
									class="tone-cell"
									class:mode={isMode}
									style:background={paint.background}
									style:color={paint.color}
									aria-pressed={selected?.rowId === row.id && selected.tone === tone}
									aria-label={`${row.label}, tone ${tone}, ${share} percent, ${numberFormat.format(count)} of ${numberFormat.format(row.n)} readings${isMode ? ', most common tone in this row' : ''}`}
									onclick={() => (selected = { rowId: row.id, tone })}
								>
									{share}%
								</button>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="tone-legend" aria-hidden="true">
		<span>0%</span>
		<span class="tone-scale"></span>
		<span>60%</span>
		<span class="tone-mode-key"><span></span> Most common in the row</span>
	</div>

	<div class="tone-detail" aria-live="polite">
		{#if selectedRow && selected}
			<p>
				<span class="tone-final">{selectedRow.label}</span>
				<span lang="zh-HK">{selectedRow.example.char}</span>
				<span lang="yue-Latn">{selectedRow.example.jyutping}</span>
			</p>
			<p>
				Tone {selected.tone}: {numberFormat.format(selectedCount)} of {numberFormat.format(selectedRow.n)} readings
				({percent(selectedCount, selectedRow.n)}%).
				{#if selectedIsMode}This is the most common tone for this ending.{/if}
			</p>
		{:else}
			<p>Choose a cell to see how many readings use that tone.</p>
		{/if}
	</div>

	{#if children}
		<div class="tone-footnote">{@render children()}</div>
	{/if}
</section>

<style>
	.tone-chart { margin-top: 3rem; scroll-margin-top: 1.5rem; }
	.tone-scroll-hint { margin-bottom: 0.5rem; color: var(--ink-faint); font-size: 0.75rem; font-weight: 650; }
	.tone-scroll { overflow-x: auto; border-block: 1px solid var(--line-strong); padding-block: 0.75rem; }
	table { width: 100%; min-width: 42rem; border-collapse: separate; border-spacing: 0.35rem; }
	th { font-weight: 650; }
	thead th { padding-bottom: 0.35rem; color: var(--ink-muted); font-size: 0.72rem; letter-spacing: 0.08em; text-align: center; text-transform: uppercase; }
	thead th:first-child, tbody th { position: sticky; left: 0; z-index: 1; background: var(--paper); text-align: right; }
	tbody th { min-width: 7.25rem; padding-right: 0.35rem; }
	.tone-final { display: block; color: var(--accent-dark); font-size: 1.05rem; font-weight: 700; letter-spacing: -0.03em; }
	.tone-example { display: block; margin-top: 0.1rem; color: var(--ink); font-family: "Noto Sans HK", "PingFang HK", sans-serif; font-size: 0.95rem; font-weight: 560; }
	.tone-example span:last-child { font-family: "Avenir Next", sans-serif; color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
	.tone-sample { display: block; color: var(--ink-faint); font-size: 0.68rem; font-weight: 650; letter-spacing: 0.04em; }
	.tone-cell { width: 100%; min-width: 3.25rem; min-height: 3rem; border: 2px solid transparent; border-radius: 0.55rem; font-variant-numeric: tabular-nums; font-weight: 700; }
	.tone-cell.mode { border-color: #9a6b12; }
	.tone-cell[aria-pressed='true'] { outline: 2px solid var(--ink); outline-offset: 2px; }
	.tone-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-top: 0.85rem; color: var(--ink-faint); font-size: 0.75rem; font-weight: 650; }
	.tone-scale { width: 8rem; height: 0.7rem; border-radius: 999px; background: linear-gradient(90deg, var(--line), var(--accent)); }
	.tone-mode-key { display: inline-flex; align-items: center; gap: 0.4rem; }
	.tone-mode-key span { width: 0.95rem; height: 0.95rem; border: 2px solid #9a6b12; border-radius: 0.25rem; }
	.tone-detail { min-height: 4.5rem; margin-top: 0.85rem; color: var(--ink-muted); font-size: 0.95rem; line-height: 1.5; }
	.tone-detail .tone-final { display: inline; margin-right: 0.45rem; }
	.tone-footnote { max-width: 40rem; margin-top: 0.35rem; color: var(--ink-muted); font-size: 0.875rem; line-height: 1.6; }
	@media (min-width: 768px) { .tone-scroll-hint { display: none; } }
</style>
