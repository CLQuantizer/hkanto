import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	accountId: "670889de2d908caac7543143db31fae5",
	worker: {
		name: "hk",
		compatibilityDate: "2026-07-21",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: ".svelte-kit/cloudflare/_worker.js",
		workersDev: true,
		previewUrls: true,
		observability: {
			logs: {
				enabled: true,
				invocationLogs: true,
			},
		},
		domains: [
			"hk.mywords.io",
		],
		env: {
			WORKERS_AI_MODEL: bindings.text("@cf/deepseek-ai/deepseek-v4.1-flash-1017"),
			WORKERS_AI_FALLBACK_MODEL: bindings.text("@cf/zai-org/glm-5.3-flash"),
			HK_DB: bindings.d1({
				name: "hk",
				id: "524e37b3-cfa4-4f35-9a46-6157c8ccb1db",
				dev: {
					remote: true,
				},
			}),
			HK_KV: bindings.kv({
				id: "75d99e6c14804ceda1c6b51d6d8767e1",
			}),
			HK_R2: bindings.r2({
				name: "hk-r2",
				dev: {
					remote: true,
				},
			}),
			AI: bindings.ai({}),
			ASSETS: bindings.assets(),
			ADMIN_PASSWORD: bindings.secret(),
			GEMS_ADMIN_PASSWORD: bindings.secret(),
			GEMS_SESSION_SECRET: bindings.secret(),
			MOONSHOT_API_KEY: bindings.secret(),
			OPENAI_API_KEY: bindings.secret(),
		},
	},
});
