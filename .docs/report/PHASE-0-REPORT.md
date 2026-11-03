# Phase 0 report

Date: 2026-11-02
Scope: foundation only. No officials, parties, records or public data pages.

## What was built

- **Repository scaffold**: `README.md`, `.env.example`, `.gitignore`,
  `Makefile`, `LICENSE` (AGPL-3.0), `apps/`, `services/`, `workers/`, `infra/`,
  and `.github/workflows/`.
- **PocketBase 0.40.6** image:
  - pinned release, SHA-256 verified for `linux/amd64` and `linux/arm64`
    in `services/pocketbase/Dockerfile`;
  - data volume at `/pb_data`;
  - first superuser created from `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` only
    when `data.db` is absent;
  - committed migration `1767225600_init_settings.js` enabling rate limits,
    trusted proxy handling and the app identity;
  - committed hook `pb_hooks/main.pb.js` reconciling S3 backup settings from
    the environment on every boot without logging secrets;
  - served with `--automigrate=false`.
- **Astro 7.4.4 static site**:
  - `lang="id"`, mobile-first layout, system fonts only;
  - `/`, `/tentang`, `/cari`, `404`;
  - exact footer text "Independen — bukan situs pemerintah.";
  - neutral paper/ink/muted-green identity, no flag motif, Garuda or
    government colours;
  - canonical + Open Graph/Twitter metadata and a 1200×630 `og.png`;
  - Pagefind 1.6.0 wired into `npm run build`, with a local-only search UI on
    `/cari`.
- **Caddy 2.11.7**: static site from `/srv/site`, `/api/*` reverse proxy,
  `/_/` IP allowlist, HSTS over HTTPS only, baseline security headers, strict
  CSP, compression, hashed-asset caching and Astro's 404 page.
- **Compose**: only `pocketbase` and `caddy`, `mem_limit` 128m/48m,
  `restart: unless-stopped`, healthchecks, `json-file` log rotation
  (10 MB × 3), named volumes.
- **GitHub Actions**: `web.yml` builds Astro + Pagefind on pinned Node 24.22.2
  and rsyncs `dist/` to `/srv/site`; `server.yml` builds/pushes the PocketBase
  image to GHCR and runs `infra/deploy.sh`. Builds never run on the server.
- **Operations docs**: hardening checklist and "what to check when down" in
  `README.md`; step-by-step restore in `infra/restore.md`.

## Verification performed locally

| Check | Result |
|---|---|
| `cp .env.example .env && make dev` (also tested with the raw compose command) | both containers started and became healthy |
| `GET /api/health` through Caddy | `200` |
| `GET /` / `/tentang` / `/cari` / missing path | `200` / `200` / `200` / `404` with Astro 404 page |
| `GET /_/` from a non-allowlisted IP | `403` |
| `GET /_/` after temporarily allowing the IP | `200` |
| Rate limiting | 3rd rapid failed auth returned `429` |
| Cors + headers | CSP, nosniff, referrer policy, X-Frame-Options, permissions policy present; no `Server` header |
| Cache headers | `_astro/*` and `pagefind/*` = 1 year immutable; HTML and `scripts/*` = 60 s |
| Search under strict CSP | typing "Pelayan" returned 2 results; no CSP/console errors |
| Lighthouse mobile on `/` | performance 100, accessibility 100, best practices 100, SEO 100 |
| 360 px viewport on all pages | no horizontal overflow (`scrollWidth == 360`) |
| Home page weight | 3.1 KB HTML + 4.4 KB CSS (~1.1 KB compressed HTML); no page JS; 37.5 KB including lazy OG/favicon assets, under the 50 KB limit |
| Backup | manual backup ZIP created; `unzip -t` clean |
| Restore | wiped a fresh `pb_data` volume, extracted the ZIP exactly as `infra/restore.md`, started the stack, and read back the test user created before the backup |
| Container log config | `json-file`, `max-size=10m`, `max-file=3` |
| Shell / compose / Caddy / YAML syntax | `bash -n`, `sh -n`, `docker compose config`, `caddy validate`, PyYAML parse all clean |

### Measured idle RAM (local Docker, after warm-up)

| Container | `docker stats` | Compose limit |
|---|---|---|
| `pelayan-rakyat-caddy-1` | ~19.4 MiB | 48 MiB |
| `pelayan-rakyat-pocketbase-1` | ~14.1 MiB | 128 MiB |
| **Total** | **~33.5 MiB** | 176 MiB |

This is well under the 200 MB Phase 0 target. The production host also needs
room for the OS and Docker daemon outside these limits.

## Deviations from the spec (and why)

1. **Added `/cari` and `public/scripts/search.js`.** The spec asks for Pagefind
   to be wired in; a tiny search page with no inline script is the smallest
   honest way to expose it while keeping the home page JS-free.
2. **Added a root `Makefile`.** It makes the "one documented command" local
   start (`make dev`) actually build the site before starting Caddy. Raw
   compose commands are still documented. No new service or framework.
3. **Pagefind needs `'wasm-unsafe-eval'` in the CSP.** Its search index is
   compiled locally with WebAssembly. Inline styles are *not* allowed; the
   strict `style-src 'self'` was verified against the search UI.
4. **Caddy reload/recreate in `deploy.sh`.** Bind-mounted `Caddyfile` changes
   do not restart a container, and `.env` changes (admin allowlist, domain)
   need a recreate. `deploy.sh` therefore force-recreates only Caddy after the
   main `up`.
5. **`deploy.sh` stores the deployed image tag in `PB_IMAGE` in `.env`.** This
   keeps later manual compose commands on the same pinned SHA instead of a
   floating tag. CI still passes the tag explicitly.
6. **The server workflow also uploads compose files.** The spec says "SSH in
   and run `infra/deploy.sh`". Uploading `docker-compose.yml`, `Caddyfile` and
   `deploy.sh` first makes the first deploy idempotent and keeps the server
   free of a git checkout. All builds still happen in Actions.
7. **`z` SELinux labels on Caddy bind mounts.** Standard Docker behaviour on
   Fedora/SELinux hosts; ignored on the Debian target. Without it, local
   Caddy could not read the repo files in the development environment.
8. **Backups are provider-neutral.** Per owner decision, `.env.example`
   documents both R2 and B2 and uses generic `PB_BACKUP_S3_*` names.
9. **AGPL-3.0** per owner decision.
10. **HTTP-on-IP only** per owner decision. `SITE_ADDRESS` is a one-line switch
    to automatic HTTPS later.
11. **PocketBase image builds only `linux/amd64` in CI.** The Dockerfile
    supports `arm64`; if the VPS is ARM, change `platforms` in `server.yml`.
12. **Pagefind's default UI emits an upstream warning** recommending its newer
    Component UI. The default UI is supported by Pagefind and works under the
    CSP; it was not changed just to silence a build warning.

## Not verified here (requires owner/server accounts)

- A real deploy to the VPS and the "live within ~5 minutes" CI acceptance.
- A real backup in an R2/B2 bucket (no bucket credentials available).
- A restore on a fresh *server* (the exact procedure was tested locally).
- UptimeRobot/Better Stack monitors and the five-minute alert test.
- The hardening checklist must be executed and confirmed by the owner.

## Owner actions to finish Phase 0

1. Create the GitHub repository and choose public/private; if private, either
   make the GHCR package readable or add `GHCR_USER`/`GHCR_TOKEN` to the
   server `.env`.
2. Create the VPS, run the Debian/Docker setup, create `/opt/pelayan-rakyat`
   and `/srv/site`, and put the production `.env` there (mode `600`).
3. Add the GitHub secrets (`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`,
   `SSH_KNOWN_HOSTS`, optional `SSH_PORT`) and the `SITE_URL` variable.
4. Run the `server` workflow, then the `web` workflow. Verify `/`,
   `/api/health`, and that `/_/` is 403 from a non-allowlisted IP.
5. Create the backup bucket, fill the S3 variables, enable backups, create one
   manual backup and restore it following `infra/restore.md`.
6. Configure the two uptime checks and test the alert by stopping PocketBase.
7. Run the hardening checklist in `README.md` and record completion.
8. When the domain is registered, point DNS at the server, set
   `SITE_ADDRESS`/`SITE_URL`, recreate Caddy, and add Cloudflare in front.

## Open questions

- VPS architecture: `amd64` is assumed by CI. Confirm before the first server
  deploy.
- GitHub repo visibility / GHCR package visibility.
- Which uptime provider the owner prefers (either free tier is fine).
- Whether to add a 32-character PocketBase settings-encryption key
  (`--encryptionEnv`) in a later phase. It would encrypt the S3 secret at rest
  in `pb_data`, at the cost of one more secret that must never be lost.
- Whether the domain will be `pelayanrakyat.id` or an alternative.

## Secrets check

- No `.env`, private key, access key or test password exists in the repository
  files; `.env` is git-ignored and `.env.example` contains only placeholders.
- The local verification stacks, including the repo-local `.env`, containers
  and named volumes, were removed after testing; no test credentials remain.
- Final post-cleanup checks passed: `make build`, Compose config validation,
  `bash -n`, `sh -n`, `node --check` and `caddy validate`.
