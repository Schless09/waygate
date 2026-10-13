<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local development

Node.js 22, Python 3.12, and ffmpeg are already on the machine. `python3-venv` is required before `python3 -m venv .venv`.

Local Supabase does not use Docker. From the repo root:

```bash
export SUPABASE_EXPERIMENTAL_STACK=1
supabase start --runtime native --eager --exclude realtime,functions,studio,mail,analytics,pooler
```

`npm run dev` reads `.env.local`. Point `NEXT_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:54321` and `SUPABASE_SERVICE_ROLE_KEY` at the local service-role key from `supabase status --env --output-format json`. The Cloud Agent start script writes that file. `ADMIN_PASSWORD` defaults to `waygate-local-admin` unless the environment already sets it. Clip scoring needs `ANTHROPIC_API_KEY`.

Routes that read cookies opt out of instant prerender validation with `export const instant = false`. Do not add `export const dynamic`; it is incompatible with `cacheComponents`.
