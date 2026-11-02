import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	alias: {
		$lib: "./src/lib",
	},
	assetsDirectory: ".svelte-kit/cloudflare",
});
