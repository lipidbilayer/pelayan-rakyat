# Pelayan Rakyat — Phase 0: Foundation

> Handoff spec for the coding agent. Build only what is in scope. When a task is done, check every acceptance criterion before moving to the next one. If something in this spec is unclear or seems wrong, stop and ask the owner instead of guessing.

## 1. Project context (read first)

**Pelayan Rakyat** is an independent, crowdsourced web app that helps Indonesian voters remember the public record of the people who serve them: what officials said (including blunders), what they promised, how they performed, and later who they are connected to or in conflict with.

- **Users**: voters, mostly on phones, often arriving from a WhatsApp link.
- **Pilot region**: DKI Jakarta (governor, DPRD DKI, wali kota, Kapolda Metro Jaya, kapolres, Jakarta's DPR RI and DPD members).
- **Principles**:
  - Officials are servants of the people. No honorifics, no glorification, no government branding.
  - Every published claim has a public source.
  - Neutral language and one standard for every party.
  - Nothing is hard-deleted. Every change keeps a history.
- **Language**: the UI is in Bahasa Indonesia. Code, comments and docs are in English.
- **This is not a government site.** Never use the Garuda, Pemprov logos or government color schemes.

Phase 0 builds the empty, running skeleton. No features yet.

## 2. Architecture decisions (tiny-server first)

The production server starts at **1 vCPU, 256 MB RAM, 10 GB disk, Debian, Docker**. Everything must fit, and must scale later without a rewrite.

| Concern | Decision | Why | Scale path later |
|---|---|---|---|
| Backend, DB, auth, admin | **PocketBase** (single Go binary, SQLite) | ~30–50 MB RAM; auth, admin UI, REST API, hooks and migrations built in | Bigger VPS (SQLite handles a lot); move to Postgres + a custom API only if write volume demands it |
| Public site | **Astro, static output** | The server only serves files; viral traffic barely touches it | Move static hosting to a CDN (Cloudflare Pages) with zero code change |
| Interactive parts | Small client-side scripts / Astro islands calling the PocketBase API | Keeps pages static | Unchanged |
| Search | **Pagefind** (static index built with the site, runs in the browser) | Zero server RAM | Meilisearch on a bigger server |
| Build | **GitHub Actions**, never on the server | Builds need 1–2 GB RAM | Unchanged |
| Crawler + AI worker (Phase 5–6) | Runs as **scheduled GitHub Actions jobs**, writing to PocketBase through its API | Keeps the server's RAM free | Move to the server as a container once RAM allows |
| Web server | **Caddy** | Tiny, automatic HTTPS, simple config | Unchanged |
| Backups | **PocketBase built-in scheduled backups to S3-compatible storage** (Cloudflare R2 or Backblaze B2) | Supported by PocketBase; no extra process | Unchanged |
| Edge | **Cloudflare** in front (when the domain exists) | DDoS protection, caching, hides the server IP | Unchanged |
| Monitoring | External uptime check (free tier of UptimeRobot or Better Stack) | No monitoring process on the tiny server | Self-hosted Uptime Kuma later |

### Memory budget (hard limits in docker-compose)

| Service | `mem_limit` |
|---|---|
| pocketbase | 128m |
| caddy | 48m |
| OS + Docker overhead | remainder |

Plus a **1 GB swap file** on the host (see task T0.7).

## 3. Scope

**In scope**
- Repo structure, Docker Compose, Caddy, PocketBase, Astro skeleton
- CI build and deploy of the static site
- Admin access protection
- Scheduled backups and a tested restore
- Server hardening checklist, log limits, external uptime check

**Out of scope (later phases)**
- Any data collections (officials, parties, records). That's Phase 1.
- Real public pages, search content, user accounts for contributors
- Crawler, AI pipeline, map

## 4. Repository structure

```
pelayan-rakyat/
├── README.md                  how to run locally and deploy
├── .env.example               every variable, no real values
├── .gitignore                 includes .env, pb_data/, node_modules/, dist/
├── apps/
│   └── web/                   Astro site (static output)
├── services/
│   └── pocketbase/
│       ├── Dockerfile         downloads a pinned PocketBase release
│       ├── pb_migrations/     committed migrations (JS)
│       └── pb_hooks/          committed hooks (JS)
├── workers/
│   └── ingest/                placeholder for Phase 5 (README only)
├── infra/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   ├── deploy.sh              server-side: pull images, restart
│   └── restore.md             step-by-step restore procedure
└── .github/workflows/
    ├── web.yml                build Astro, deploy static files
    └── server.yml             build PocketBase image, deploy compose
```

## 5. Tasks

### T0.1 Repository scaffold
- Create the structure above with a README describing the project in three or four sentences, local setup and deploy.
- `.env.example` lists every variable used anywhere.

**Accept when**: a fresh clone plus `cp .env.example .env` plus one documented command starts the stack locally.

### T0.2 PocketBase service
- Dockerfile downloads a **pinned PocketBase release** (exact version, verified checksum). Never use `latest`.
- Data volume mounted at `/pb_data`. Migrations and hooks are copied in from the repo.
- The first superuser is created from environment variables on first boot only.
- Collection changes are made **only through committed migrations**, never by hand in production.
- Enable PocketBase's built-in rate limiting.

**Accept when**: `GET /api/health` returns 200 and the container stays under 128 MB at idle (check with `docker stats`).

### T0.3 Astro site skeleton
- Static output (`output: 'static'`), `lang="id"`, mobile-first base layout.
- Pages: `/` (placeholder hero: "Pelayan Rakyat" + tagline "Kita gaji, kita nilai."), `/tentang` (placeholder about page), `404`.
- Footer on every page: **"Independen — bukan situs pemerintah."**
- Neutral visual identity: no red-white flag motif, no Garuda, no government blue/gold.
- Pagefind is wired into the build, even with only placeholder content.
- Default Open Graph meta tags and image in the base layout.
- System fonts or a single self-hosted font. Keep total CSS + JS on the home page under 50 KB.

**Accept when**: `npm run build` produces `dist/`, Lighthouse mobile scores ≥ 95 for performance and accessibility on the home page, and the page is readable at 360 px width.

### T0.4 Caddy
- Serves the static site from `/srv/site` at `/`.
- Reverse proxies `/api/*` to PocketBase.
- **PocketBase admin (`/_/`) is not public**: allow it only from an IP allowlist set in `.env`. (When the domain and Cloudflare exist, this moves to Cloudflare Access.)
- Security headers: HSTS (only once HTTPS is on), `X-Content-Type-Options`, `Referrer-Policy`, a strict `Content-Security-Policy` that allows the site's own origin and its API.
- Compression on. Long cache headers for hashed assets, short ones for HTML.
- **Before a domain exists**: serve on the server IP over HTTP for testing. Write the config so adding the domain later is a one-line change that turns on automatic HTTPS.

**Accept when**: the home page loads from the server IP, `/api/health` works through Caddy, `/_/` returns 403 from an IP that isn't allowlisted, and Caddy stays under 48 MB.

### T0.5 Docker Compose
- Services: `caddy` and `pocketbase` only.
- `mem_limit` as in the budget, `restart: unless-stopped`, healthchecks.
- **Log rotation on every service**: `json-file` driver with `max-size: 10m` and `max-file: 3`. The disk is only 10 GB.
- Named volumes for `pb_data` and Caddy data.

**Accept when**: `docker compose up -d` on the server brings both services up healthy, and a reboot brings them back automatically.

### T0.6 CI and deploy (GitHub Actions)
- `web.yml`: on push to `main`, install, build Astro (including Pagefind), then deploy `dist/` to the server's `/srv/site` with `rsync` over SSH, using a deploy key stored in GitHub Secrets.
- `server.yml`: on changes under `services/` or `infra/`, build the PocketBase image, push it to GitHub Container Registry, then SSH in and run `infra/deploy.sh`.
- No secrets in the repo or in logs.
- Builds never run on the server.

**Accept when**: a commit that changes the home page text is live on the server within about five minutes with no manual step.

### T0.7 Server hardening (document as a checklist in README; the owner runs it)
- SSH keys only; password login and root login disabled.
- Firewall (`ufw` or `nftables`): allow 22, 80 and 443 only. Once Cloudflare is in front, restrict 80/443 to Cloudflare IP ranges.
- `unattended-upgrades` for security updates.
- **1 GB swap file** with low swappiness (e.g. `vm.swappiness=10`).
- `fail2ban` for SSH.
- Docker log limits as in T0.5.

**Accept when**: the checklist exists in the README and the owner has confirmed each item.

### T0.8 Backups and restore
- Configure PocketBase's built-in **scheduled backups** to an S3-compatible bucket (R2 or B2): daily, keep 14.
- Bucket credentials come from `.env`, never the repo.
- Write `infra/restore.md`: how to restore a backup onto a fresh server, step by step.

**Accept when**: a backup appears in the bucket, and a restore onto a fresh local container (following `restore.md` exactly) brings back a test record created before the backup.

### T0.9 Monitoring
- Set up an external uptime check on `/` and `/api/health` with email alerts to the owner.
- Add a short "What to check when it's down" section to the README.

**Accept when**: stopping the PocketBase container triggers an alert within five minutes.

## 6. Definition of done for Phase 0

- [ ] The stack runs on the 256 MB server: `docker stats` shows total container memory under 200 MB at idle
- [ ] The home and about pages are live from the server, built and deployed by CI
- [ ] `/api/health` works; `/_/` admin is blocked for non-allowlisted IPs
- [ ] A backup exists in the bucket and a restore has been tested
- [ ] The uptime alert has been tested
- [ ] The README covers local setup, deploy, the hardening checklist and restore
- [ ] No secrets in git history

## 7. Rules for the agent

- Pin every dependency and image to an exact version. No `latest`, no ranges in production images.
- Don't add services, databases or frameworks beyond this spec without asking.
- Every PocketBase schema change goes through a committed migration.
- Keep the RAM budget in mind for every decision. If something won't fit, stop and report it instead of raising limits.
- At the end, write `PHASE-0-REPORT.md`: what was built, any deviations from this spec and why, open questions, and the measured idle RAM of each container.

## 8. Decisions needed from the owner before or during Phase 0

1. **Git host**: GitHub is assumed (for Actions and the container registry).
2. **Public or private repo**: a public, open-source repo gets free Actions minutes and builds trust ("see how we work"). A private repo has a limited free quota, and Phase 5–6 scheduled jobs will use it.
3. **License, if open source**: AGPL-3.0 is suggested, so anyone who runs a copy must share their changes.
4. **Backup bucket**: Cloudflare R2 or Backblaze B2. Both have free tiers that cover this size.
5. **Domain**: register `pelayanrakyat.id` (or an alternative) before launch. Phase 0 works on the IP until then.
