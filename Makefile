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

verify:
	./scripts/verify.sh
