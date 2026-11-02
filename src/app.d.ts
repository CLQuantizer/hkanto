// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env & {
				ADMIN_PASSWORD?: string;
				GEMS_ADMIN_PASSWORD?: string;
				GEMS_SESSION_SECRET?: string;
				WORKERS_AI_MODEL?: string;
				WORKERS_AI_FALLBACK_MODEL?: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties
		}

		// interface Error {}
		interface Locals {
			isAdmin: boolean;
			isGemsAdmin: boolean;
			passkeyUserId: string | null;
		}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};
