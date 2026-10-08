# Supabase + App on Openship — Full Package

Everything needed to run an app **with its own self-hosted Supabase** on your Openship server.

```
supabase-fullstack/
├── app/                       React + Vite app (login + notes) using supabase-js
│   ├── Dockerfile             build with Node → serve with nginx on port 80
│   ├── nginx.conf
│   └── .env.example           VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
├── supabase/migrations/       database schema (notes table + RLS policies)
├── scripts/
│   ├── show-supabase-info.sh       prints Supabase containers, keys (masked), URLs
│   ├── apply-migrations.sh         runs supabase/migrations/*.sql on the Supabase DB
│   └── migrate-from-old-supabase.sh  copies schema + data + users from an old Supabase
└── supabase-stack/            official Supabase self-hosting Docker setup (Apache-2.0)
```

---

## How it works

```
Visitor's browser
  ├── https://notes.<domain>      → Openship edge → app container (nginx :80)
  │                                  (HTML + JS only — the JS talks to Supabase directly)
  └── https://supabase.<domain>   → Openship edge → Supabase Kong :8000
                                        ├── /auth/v1     → Auth (GoTrue)   sign up / sign in
                                        ├── /rest/v1     → PostgREST       tables (notes)
                                        ├── /storage/v1  → Storage         files
                                        ├── /realtime/v1 → Realtime        live updates
                                        └── /            → Studio          admin UI (password)
                                                   │
                                            Supabase Postgres (internal only, never public)
```

Key points:

| Thing | Where it lives | Public? |
|---|---|---|
| App (`app/`) | its own Openship project | ✅ `https://notes.<domain>` |
| Supabase API (Kong) | Supabase project in Openship | ✅ `https://supabase.<domain>` |
| Postgres | inside Supabase stack | ❌ never |
| `ANON_KEY` | in the app (browser) | public by design — **RLS** protects data |
| `SERVICE_ROLE_KEY` | Supabase only / server code | ❌ never in `VITE_*` |

The app and Supabase are **two separate Openship projects** that talk over HTTPS — the same
way a Lovable app talks to supabase.co, just on your own server.

---

## Part A — Supabase on Openship

### Option 1 (recommended): Openship's Supabase template

You already have this running (`openship-supabase-kong`, `-auth`, `-db`, …).

1. **Domain** — Supabase project → **Domains & Routes → Add domain**
   - `supabase.<domain>` → service **kong**, port **8000** → **Re-check** (Verified + SSL)
2. **Environment** — Supabase project → Environment (no quotes):
   ```
   API_EXTERNAL_URL=https://supabase.<domain>
   SUPABASE_PUBLIC_URL=https://supabase.<domain>
   SITE_URL=https://notes.<domain>
   ADDITIONAL_REDIRECT_URLS=https://notes.<domain>/**
   ENABLE_EMAIL_AUTOCONFIRM=true          # testing without SMTP
   ```
   **Save → Redeploy** the Supabase project.
   (`API_EXTERNAL_URL` missing = auth container keeps restarting.)
3. **Check** (server):
   ```bash
   bash scripts/show-supabase-info.sh
   curl -s https://supabase.<domain>/auth/v1/health        # {"name":"GoTrue",...}
   ```

### Option 2: deploy `supabase-stack/` yourself (any Docker host)

The official stack, unchanged. On a server with Docker:

```bash
cd supabase-stack
cp .env.example .env
sh utils/generate-keys.sh --update-env          # JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, …
# edit .env: SUPABASE_PUBLIC_URL / API_EXTERNAL_URL = https://supabase.<domain>,
#            SITE_URL, DASHBOARD_PASSWORD (strong!), POSTGRES_PASSWORD
docker compose pull && docker compose up -d
docker compose ps
```

Then put `https://supabase.<domain>` in front of the API gateway port (8000) with your proxy.
Read `supabase-stack/README.md` and `CONFIG.md` for all options.

> On Openship, **use Option 1**. The stack is ~10 containers with bind-mounted config files;
> Openship's template is built for it, while a folder upload is temporary (~60 min) and not
> suited to a stateful database stack. Keep `supabase-stack/` for reference, other servers,
> or local testing.

---

## Part B — Create the tables

On the EC2 server (copy this folder there, e.g. via GitHub clone):

```bash
cd supabase-fullstack
bash scripts/apply-migrations.sh          # auto-detects openship-supabase-db, backs up first
```

Creates `public.notes` with **Row Level Security**: every user sees only their own notes.

Migrating from an existing Supabase instead:

```bash
SRC='postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  bash scripts/migrate-from-old-supabase.sh
```

(Users must sign in again if the JWT secret differs; passwords carry over.)

---

## Part C — Deploy the app on Openship

1. Push `app/` to GitHub (or the whole folder and set Source Folder = `app`).
2. Openship → **New Project → GitHub** → repo → branch `main`.

| Field | Value |
|---|---|
| Target | `dev` |
| Source Folder | `app` (if the repo contains the whole package) |
| Build type | **Dockerfile** |
| Install / Build / Start | **empty** (Dockerfile does it; nginx is the start command) |
| Port | **80** |
| Env vars | `VITE_SUPABASE_URL=https://supabase.<domain>` · `VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>` |
| Domain | Custom → `notes.<domain>` (port 80) |

Get `ANON_KEY`: `SHOW=1 bash scripts/show-supabase-info.sh` (copy only into Openship).

**Deploy** → Domains & Routes → **Re-check** → open `https://notes.<domain>`.

Without Dockerfile (Node mode): Install `npm install` · Build `npm run build` · Start `npm start` · Port `3000`.

---

## Part D — Test

1. Page header shows `Auth: ok (GoTrue …)`.
2. **Create account** → (auto-confirm on) → you are signed in.
3. Add / tick / delete notes.
4. Sign in as a second user → you see **none** of the first user's notes (RLS works).
5. Studio: `https://supabase.<domain>` → `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`
   → Table editor → `notes`.

| Problem | Fix |
|---|---|
| "VITE_SUPABASE_URL … not set" | env vars missing at build → set them → **redeploy** |
| `Auth: unreachable` | Supabase domain not routed / auth container restarting (`docker logs openship-supabase-auth`) |
| `relation "public.notes" does not exist` | run `scripts/apply-migrations.sh` |
| Sign-up says "check your email" | set `ENABLE_EMAIL_AUTOCONFIRM=true` or configure SMTP |
| `sh: npm: not found` | Dockerfile build → Start Command must be **empty**, Port 80 |
| Site down, container Up | Openship Port ≠ 80 |

---

## Security checklist

- [ ] Strong `DASHBOARD_PASSWORD`, `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 chars)
- [ ] Postgres port never published
- [ ] RLS enabled on every table (the anon key is public)
- [ ] `SERVICE_ROLE_KEY` only server-side, never in `VITE_*`
- [ ] SMTP configured + `ENABLE_EMAIL_AUTOCONFIRM=false` for real users
- [ ] Daily DB backup:
      `docker exec openship-supabase-db pg_dump -U postgres postgres | gzip > ~/supabase-$(date +%F).sql.gz`
- [ ] Instance ≥ t3.medium (Supabase ≈ 10 containers + your builds)
