# Pelayan Rakyat

Pelayan Rakyat is an independent, crowdsourced web app that helps Indonesian
voters remember the public record of the people who serve them: what officials
said, what they promised, how they performed, and later who they are connected
to or in conflict with. It is built for phones and for people arriving from a
WhatsApp link, starting with DKI Jakarta. Every published claim must have a
public source, every party gets the same neutral standard, and nothing is ever
hard-deleted. This is **not** a government site and uses no government logos or
colours.

Phase 0 is the empty, running skeleton: a static Astro site, PocketBase, Caddy,
CI deploys, backups and a hardening checklist. Data collections and real public
pages start in Phase 1.

## Stack

| Concern | Choice |
|---|---|
| Backend, DB, auth, admin | PocketBase `0.40.6`, SQLite, built-in dashboard |
| Public site | Astro `7.4.4`, static output |
| Search | Pagefind `1.6.0`, indexed at build time and run in the browser |
| Web server | Caddy `2.11.7`, automatic HTTPS when a domain is set |
| Builds | GitHub Actions, never on the server |
| Backups | PocketBase scheduled backups to an S3-compatible bucket |
| Host | 1 vCPU, 256 MB RAM, 10 GB disk, Debian + Docker |

Compose memory limits are `128m` for PocketBase and `48m` for Caddy. See
[PHASE-0-REPORT.md](.docs/report/PHASE-0-REPORT.md) for measured idle usage.

## Repository layout

```
apps/web/                 Astro static site (Indonesian UI)
services/pocketbase/      Dockerfile, entrypoint, committed migrations + hooks
workers/ingest/           Phase 5 placeholder (README only)
infra/docker-compose.yml  caddy + pocketbase, limits, healthchecks, log rotation
infra/Caddyfile           static site, /api proxy, /_/ IP allowlist, headers
infra/deploy.sh           server-side pull + restart, never builds
infra/restore.md          tested restore procedure
.github/workflows/        web.yml (site) and server.yml (image + compose)
```

## Local development

Requirements: Docker Engine with Compose v2, Node.js 24+, and `make` (optional).

```bash
git clone <repo> pelayan-rakyat
cd pelayan-rakyat
cp .env.example .env
# Set a real PB_ADMIN_PASSWORD in .env before the first boot.
make dev
```

`make dev` installs dependencies, builds Astro + the Pagefind index, and starts
both containers. The same steps without `make`:

```bash
cd apps/web && npm ci && npm run build && cd ../..
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

Then:

- Site: <http://localhost/>
- Search: <http://localhost/cari>
- PocketBase API health: <http://localhost/api/health>
- Dashboard: <http://127.0.0.1:8081/_/> over the admin listener (SSH tunnel or Tailscale)

The superuser is created **once**, on first boot, when the `pb_data` volume has
no `data.db`. Later changes to `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` do not
modify an existing account. The public listener returns 404 for `/_/`.

Useful commands:

```bash
make build                 # rebuild the site + search index only
make logs                  # follow both containers
make stats                 # memory snapshot
docker compose --env-file .env -f infra/docker-compose.yml down
```

PocketBase data lives in the `pelayan-rakyat_pb_data` named volume. The site is
served from the host path in `SITE_ROOT` (default `../apps/web/dist`).

## Configuration

All runtime configuration is in `.env` (ignored by git). `.env.example` lists
every variable.

| Variable | Purpose |
|---|---|
| `SITE_ADDRESS` | Caddy listener. `http://:80` on the IP now; the bare domain later for automatic HTTPS. |
| `SITE_URL` | Canonical/OG base URL. Also becomes PocketBase's app URL on first migration. Build-time for Astro, so CI reads the `SITE_URL` repository variable. |
| `SITE_ROOT` | Host path Caddy mounts at `/srv/site`. Production: `/srv/site`. |
| `ADMIN_LISTEN_ADDRESS` | Loopback/Tailscale address where Caddy serves `/_/` (default `http://127.0.0.1:8081`). Reach it with an SSH tunnel or Tailscale; it is never published publicly. |
| `PB_ENCRYPTION_KEY` | Optional 32-character key. When set, PocketBase encrypts app settings at rest. Losing it makes encrypted settings unrecoverable. |
| `PB_IMAGE` | Image tag for Compose. `deploy.sh` replaces it with the deployed GHCR tag. |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` | First-boot superuser only. |
| `PB_BACKUP_S3_ENABLED` | Set `true` to enable scheduled remote backups. |
| `PB_BACKUP_CRON` | Cron expression, default `0 2 * * *` (02:00 UTC daily). |
| `PB_BACKUP_KEEP` | Number of automatic backups to retain, default `14`. |
| `PB_BACKUP_S3_*` | Bucket, region, endpoint, access key, secret, path-style flag. |
| `GHCR_USER`, `GHCR_TOKEN` | Optional, only for a private GHCR package. |

**Migrations only.** Collection/schema changes go in
`services/pocketbase/pb_migrations/` and are committed. Production runs with
`--automigrate=false`; hand edits in the dashboard are not the source of truth.

## Deploy to the server

### 1. Prepare the Debian server (owner, once)

Install Docker Engine and the Compose plugin from Docker's official Debian
repository (`docker-ce`, `docker-ce-cli`, `containerd.io`,
`docker-buildx-plugin`, `docker-compose-plugin`), then enable it:

```bash
sudo systemctl enable --now docker
```

Create a non-root deploy user and the two directories the workflows use:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -m 0755 -o deploy -g deploy /opt/pelayan-rakyat /srv/site
sudo install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
```

Add the CI public key to `/home/deploy/.ssh/authorized_keys` (mode `0600`) and
keep the private key out of the repo. Generate a dedicated key outside the
repository:

```bash
ssh-keygen -t ed25519 -C "github-actions@pelayan-rakyat" -f ~/.ssh/pelayan-deploy -N ""
```

Create the server environment file from `.env.example`, then set production
values (`SITE_ROOT=/srv/site`, `SITE_ADDRESS=http://:80`,
`SITE_URL=http://<server-ip>`, a strong admin password, and backup values):

```bash
scp .env.example deploy@<server-ip>:/opt/pelayan-rakyat/.env
ssh deploy@<server-ip> 'chmod 600 /opt/pelayan-rakyat/.env'
```

### 2. Configure GitHub (owner, once)

Repository secrets:

| Secret | Value |
|---|---|
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Full contents of the deploy private key |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H <server-ip>`; pin it, do not trust on first use |
| `SSH_PORT` | Optional, defaults to `22` |

Repository variable:

| Variable | Value |
|---|---|
| `SITE_URL` | `http://<server-ip>` now, `https://pelayanrakyat.id` after DNS |

The package is public by default when the repository is public, so the server
needs no registry login. For a private package, put a PAT with `read:packages`
in the server `.env` as `GHCR_USER` / `GHCR_TOKEN`.

### 3. First deploy

Run **server** first (it creates `docker-compose.yml`, `Caddyfile` and
`deploy.sh` on the server and starts PocketBase + Caddy), then **web** (it
rsyncs `dist/` to `/srv/site`). Both are `workflow_dispatch`-able from the
Actions tab.

```bash
# local check before pushing:
cd apps/web && npm ci && npm run build
```

After a deploy:

```bash
curl -fsS http://<server-ip>/api/health
curl -fsSI http://<server-ip>/
```

`/_/` should return 404 on the public listener, while the admin listener on
`127.0.0.1:8081` opens the dashboard.

### Routine deploys

- Changing anything under `apps/web/` builds and deploys the site.
- Changing anything under `services/` or `infra/` builds a new GHCR image tagged
  with the commit SHA, uploads compose files, and runs `infra/deploy.sh`.
- The server only pulls images; it never runs a build.

### Adding the domain and HTTPS

1. Point an `A` record for the domain at the server IP.
2. Set `SITE_ADDRESS=pelayanrakyat.id` in the server `.env`.
3. Set `SITE_URL=https://pelayanrakyat.id` in the server `.env` and in the
   GitHub repository variable, then rebuild the site.
4. Recreate the containers so Caddy reads the new environment:

```bash
cd /opt/pelayan-rakyat
docker compose --env-file .env -f docker-compose.yml up -d --force-recreate
```

Caddy obtains and renews the certificate automatically. HSTS turns on by itself
once the site is served over HTTPS. Keep ports 80 and 443 open for certificate
issuance. When Cloudflare is added later, move `/_/` protection to Cloudflare
Access and restrict 80/443 to Cloudflare IP ranges.

## Backups and restore

Backups are PocketBase's built-in full `pb_data` ZIP snapshots, scheduled daily
at 02:00 UTC and trimmed to the newest 14. The hook
`services/pocketbase/pb_hooks/main.pb.js` reconciles the schedule and bucket
configuration from `.env` on every boot; credentials never enter the repo.

To enable:

1. Create a **private** S3-compatible bucket (Cloudflare R2 or Backblaze B2).
2. Create an access key limited to that bucket.
3. Fill `PB_BACKUP_S3_*` in `.env` and set `PB_BACKUP_S3_ENABLED=true`.
4. Recreate PocketBase:

```bash
cd /opt/pelayan-rakyat
docker compose --env-file .env -f docker-compose.yml up -d --force-recreate pocketbase
docker compose --env-file .env -f docker-compose.yml logs --tail=30 pocketbase
```

Look for `[backups] settings reconciled from environment`. Open
**Settings → Backups** in the dashboard, confirm S3 is enabled with the cron
`0 2 * * *` and keep count 14, then press **Create backup** once and verify the
ZIP appears in the bucket.

Restore steps, including a fresh-server volume replacement, are in
[infra/restore.md](infra/restore.md). Test the procedure before launch.

## Monitoring

Use an external uptime service (UptimeRobot or Better Stack free tier), not a
process on the 256 MB server. Create two HTTP checks with email alerts:

- `http(s)://<host>/` — expect 200 and the text `Pelayan Rakyat`.
- `http(s)://<host>/api/health` — expect 200 and JSON `"code":200`.

A one-minute interval is fine. To test the alert, stop PocketBase, wait for the
check to fail (under five minutes), then start it again.

### What to check when it is down

Run these on the server, in `/opt/pelayan-rakyat`:

```bash
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=100
docker stats --no-stream
df -h
curl -fsS http://127.0.0.1/api/health
```

Order of likelihood:

1. **PocketBase unhealthy or restarting** — read its logs; a corrupt DB, a bad
   migration, or a full disk (`df -h`) will show up here.
2. **Caddy unhealthy** — validate the config with
   `docker compose ... exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
3. **TLS/certificate problem** — check Caddy logs for ACME errors and confirm
   ports 80/443 reach the server.
4. **Host resource pressure** — `docker stats` and `free -m`; the swap file
   should absorb short spikes, not sustained load.
5. **Upstream DNS/Cloudflare** — if only some networks fail, check the edge
   before touching the server.

After fixing, confirm `/`, `/api/health` and an allowlisted `/_/` login.

## Server hardening checklist (owner runs it)

Tick every item and record the date in the operations log.

- [ ] **SSH keys only, no root login.** Create
      `/etc/ssh/sshd_config.d/99-pelayan-rakyat.conf`:

      ```sshconfig
      PermitRootLogin no
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PubkeyAuthentication yes
      ```

      Then `sudo sshd -t && sudo systemctl reload ssh`. Keep an existing session
      open until a second key-based login works.
- [ ] **Firewall.** `sudo ufw default deny incoming`, `sudo ufw allow OpenSSH`,
      `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`, `sudo ufw enable`.
      Note that Docker publishes ports through its own iptables rules; UFW does
      not filter them. The only published ports are 80/443, which are meant to
      be public. When Cloudflare is in front, restrict 80/443 to Cloudflare IP
      ranges with `DOCKER-USER` iptables rules (or equivalent nftables rules),
      not with a plain UFW deny.
- [ ] **Unattended security updates.** Install `unattended-upgrades`, enable it
      with `sudo dpkg-reconfigure -plow unattended-upgrades`, and verify
      `/var/log/unattended-upgrades/` after the first night.
- [ ] **1 GB swap, low swappiness.**

      ```bash
      sudo fallocate -l 1G /swapfile
      sudo chmod 600 /swapfile
      sudo mkswap /swapfile
      sudo swapon /swapfile
      echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
      echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-pelayan-rakyat.conf
      sudo sysctl --system
      ```

- [ ] **fail2ban for SSH.** Install `fail2ban`, enable the `sshd` jail in
      `/etc/fail2ban/jail.local`, then `sudo systemctl enable --now fail2ban`
      and check `sudo fail2ban-client status sshd`.
- [ ] **Docker log limits.** Already set for both services in
      `infra/docker-compose.yml` (`json-file`, 10 MB × 3). Confirm with
      `docker inspect --format '{{.HostConfig.LogConfig}}' $(docker compose ... ps -q)`.
- [ ] **No secrets in git.** `.env` is ignored; scan the history with
      `git log -p | grep -iE 'password|secret|token'` before making the repo
      public.
- [ ] **Backups verified.** A backup exists in the bucket and a restore has
      been tested following `infra/restore.md`.
- [ ] **Uptime alert verified.** Stopping PocketBase produces an email within
      five minutes.

## Security notes

- PocketBase is never published to the host; only Caddy exposes ports 80/443.
- `/_/` is not served on the public listener; it is only reachable through the
  loopback/Tailscale admin listener.
- Caddy sets a strict CSP (`script-src 'self' 'wasm-unsafe-eval'`,
  `object-src 'none'`, `frame-ancestors 'none'`, no inline styles), `nosniff`,
  a referrer policy and HSTS over HTTPS. `'wasm-unsafe-eval'` is present only
  because Pagefind compiles its local search index with WebAssembly.
- PocketBase rate limiting is enabled by migration.
- CI keys are written to a temporary file on the runner, never printed, and
  removed afterwards.
- Use a separate bucket only for backups; do not reuse the credentials
  elsewhere.

## Moderator screen

`/moderasi` is a small client-side area for `moderator` and `admin` users. It is
not linked from public pages, has `noindex, nofollow`, and is disallowed in
`robots.txt`. Sign in uses email and password. MFA is not enabled in Phase 1
because SMTP is not configured yet; the owner can enable email OTP from the
PocketBase dashboard once SMTP is available.

## Roster importer

The importer lives in `tools/import-roster/` and runs on the owner's machine or
as a manual GitHub Action. It never runs on the 256 MB server.

```bash
cd tools/import-roster
npm ci
npm run build
PB_URL=http://127.0.0.1:8081 \
PB_SUPERUSER_EMAIL=admin@example.com \
PB_SUPERUSER_PASSWORD=... \
node dist/src/cli.js --parties parties.csv --roster roster.csv
```

Dry run is the default and writes a `dry_run` batch without changing data. Add
`--apply` to write. Re-running the same files reports `0 changes`. Draft CSVs
belong in `data/drafts/` (git-ignored).

## License

AGPL-3.0. See [LICENSE](LICENSE).
