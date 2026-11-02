<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>Gems Admin · 講粵語</title></svelte:head>

<main class="admin-shell">

	{#if !data.authenticated}
		<section class="login-panel">
			<p class="eyebrow">Private</p>
			<h1>Gems admin</h1>
			<p>Sign in to publish and manage Cantonese articles.</p>
			<form method="POST" action="?/login">
				<label for="password">Admin password</label>
				<input id="password" name="password" type="password" autocomplete="current-password" required />
				{#if form?.loginError}<p class="form-error" role="alert">{form.loginError}</p>{/if}
				<button class="primary-button" type="submit">Sign in <span aria-hidden="true">→</span></button>
			</form>
		</section>
	{:else}
		<header class="admin-header">
			<div><p class="eyebrow">CMS</p><h1>Manage gems</h1></div>
			<form method="POST" action="?/logout"><button class="copy-button" type="submit">Sign out</button></form>
		</header>

		<section class="upload-panel" aria-labelledby="upload-heading">
			<div><h2 id="upload-heading">Upload an article</h2><p>The first H1 becomes the title. Uploading the same slug updates the existing article.</p></div>
			<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance>
				<label for="article">Markdown file</label>
				<input id="article" name="article" type="file" accept=".md,text/markdown,text/plain" required />
				<label for="slug">Custom URL slug <span>(optional)</span></label>
				<input id="slug" name="slug" type="text" placeholder="ordering-at-cha-chaan-teng" pattern="[a-zA-Z0-9\u3400-\u9fff-]+" />
				{#if form?.uploadError}<p class="form-error" role="alert">{form.uploadError}</p>{/if}
				<button class="primary-button" type="submit">Publish article <span aria-hidden="true">↑</span></button>
			</form>
		</section>

		<section class="admin-articles" aria-labelledby="managed-heading">
			<div class="section-heading"><h2 id="managed-heading">Published</h2><span>{data.gems.length} total</span></div>
			{#each data.gems as gem (gem.id)}
				<div class="admin-article-row">
					<div><a href={`/gems/${gem.slug}`}>{gem.title}</a><p>/gems/{gem.slug}</p></div>
					<time datetime={gem.updated_at}>{new Date(gem.updated_at).toLocaleDateString()}</time>
					<form method="POST" action="?/delete" onsubmit={(event) => { if (!confirm(`Delete “${gem.title}”?`)) event.preventDefault(); }}>
						<input type="hidden" name="id" value={gem.id} />
						<button class="danger-button" type="submit">Delete</button>
					</form>
				</div>
			{/each}
		</section>
	{/if}
</main>
