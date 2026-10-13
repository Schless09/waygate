# Waygate audio annotation trial

A small, server-timed assessment for candidates to transcribe two meeting clips.
Built with Next.js App Router, Supabase, and Anthropic, and designed for Vercel.

## What it includes

- Candidate sign-in with one completed attempt per email
- Two timed tasks with audio controls, hotkeys, local autosave, and telemetry
- Server-only references and one-hour Supabase Storage signed URLs
- Deterministic WER/pace scoring plus Claude speaker/format scoring
- Password-protected admin results, re-scoring, and CSV export

## Local setup

Requirements: Node.js 20+, Python 3.11+, and `ffmpeg`.

1. Create a Supabase project.
2. Run `supabase/migrations/20261013000000_initial_schema.sql` in the SQL editor
   or with the Supabase CLI. It creates the private `trial-audio` bucket. If
   bucket creation is restricted, create a private bucket with that name in the
   Storage dashboard.
3. Copy `.env.example` to `.env.local` and fill in all values.
4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Prepare the clips:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r scripts/requirements.txt
   python scripts/prepare_clips.py --dry-run
   python scripts/prepare_clips.py
   ```

The dry run prints the chosen meeting IDs and windows. The standard clip favors
clear turns and less overlap; the hard clip favors faster turns and more overlap.
See `ATTRIBUTION.md` for the AMI credit and CC BY 4.0 license.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database and Storage access |
| `ANTHROPIC_API_KEY` | Server-only Claude scoring |
| `ADMIN_PASSWORD` | Admin password and cookie-signing secret |

## Deploy to Vercel

Import the repository into Vercel, add all four variables to the Production
environment, and deploy with the default Next.js settings. Run the migration and
clip preparation against the production Supabase project before inviting users.

Scoring is scheduled with Next.js `after()` so submission navigation is not
blocked. Errors are saved on the score row and can be retried from the admin
detail page.

## Security model

Every application table has RLS enabled and no public policies. All database
writes and reads use the service role from server-only code. Candidate pages
select only safe clip metadata and receive a short-lived audio URL. Reference
transcripts and utterances are selected only by scoring and authenticated admin
code. Candidate and admin tokens use `httpOnly` cookies.
