# Local development helpers. Production builds run in GitHub Actions.
COMPOSE := docker compose --env-file .env -f infra/docker-compose.yml

.PHONY: dev build install up down logs stats

# Fresh clone: cp .env.example .env && make dev
dev: install build up

install:
	cd apps/web && npm ci

build:
	@SITE_URL="$$(sed -n 's/^SITE_URL=//p' .env 2>/dev/null | head -n1)"; \
	cd apps/web && SITE_URL="$${SITE_URL:-http://localhost}" npm run build

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

stats:
	docker stats --no-stream

STAGING_ROOT ?= /srv/site
VERSIONS_DIR = $(STAGING_ROOT)-versions

deploy-staging: verify
	@VERSION=$$(date +%Y%m%d%H%M%S); \
	DEST="$(VERSIONS_DIR)/$$VERSION"; \
	mkdir -p "$(VERSIONS_DIR)"; \
	rm -rf "$$DEST"; \
	mkdir -p "$$DEST"; \
	cp -a apps/web/dist/. "$$DEST"/; \
	if [ -e "$(STAGING_ROOT)" ] && [ ! -L "$(STAGING_ROOT)" ]; then \
		mv "$(STAGING_ROOT)" "$(STAGING_ROOT).backup.$$VERSION"; \
	fi; \
	ln -sfn "$$DEST" "$(STAGING_ROOT).next"; \
	mv -Tf "$(STAGING_ROOT).next" "$(STAGING_ROOT)"; \
	ls -1dt "$(VERSIONS_DIR)"/* 2>/dev/null | tail -n +4 | xargs -r rm -rf; \
	echo "Deployed $$VERSION to $(STAGING_ROOT)"

rollback:
	@PREV=$$(ls -1dt "$(VERSIONS_DIR)"/* 2>/dev/null | sed -n '2p'); \
	if [ -z "$$PREV" ]; then echo "No previous version" >&2; exit 1; fi; \
	ln -sfn "$$PREV" "$(STAGING_ROOT).next"; \
	mv -Tf "$(STAGING_ROOT).next" "$(STAGING_ROOT)"; \
	echo "Rolled back to $$PREV"

verify:
	./scripts/verify.sh
