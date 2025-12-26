# ========================================
# Makefile for Bun + drizzle-kit Projects
# ========================================

# ===========================
# Help
# ===========================
help:
	@echo ""
	@echo "Available commands:"
	@echo "  make dev             - Start the development server"
	@echo "  make build           - Build the project"
	@echo "  make lint            - Lint the project"
	@echo "  make format          - Format the project"
	@echo "  make test            - Run tests"
	@echo "  make test-watch      - Run tests in watch mode"
	@echo "  make db-migrate      - Run database migrations (prod)"
	@echo "  make db-migrate-dev  - Run database migrations (dev)"
	@echo "  make db-seed         - Run database seeder"
	@echo "  make db-reset        - Reset database"
	@echo "  make db-studio       - Start drizzle-kit Studio"
	@echo "  make deploy-prep     - Prepare the project for deployment"
	@echo ""

# ===========================
# Development
# ===========================
dev:
	@echo "Starting development server..."
	bun run start:dev

# ===========================
# Build
# ===========================
build:
	@echo "Building the project..."
	bun run build

# ===========================
# Lint & Format
# ===========================
lint:
	@echo "Linting the project..."
	bun run lint

format:
	@echo "Formatting the project..."
	bun run format

# ===========================
# Tests
# ===========================
test:
	@echo "Running tests..."
	bun run test

test-watch:
	@echo "Running tests in watch mode..."
	bun run test:watch

# ===========================
# Database (drizzle-kit)
# ===========================
db-migrate:
	@echo "Running database migrations (production)..."
	bunx --bun drizzle-kit migrate

db-migrate-dev:
	@echo "Running database migrations (development)..."
	bunx --bun drizzle-kit generate
	bunx --bun drizzle-kit migrate

db-seed:
	@echo "Running database seeder..."
	bun run seed

db-studio:
	@echo "Starting drizzle-kit Studio..."
	bunx --bun drizzle-kit studio

# ===========================
# Deployment
# ===========================
deploy-prep:
	@echo "Preparing for deployment..."
	bun install --frozen-lockfile
	bunx --bun drizzle-kit migrate
	bun run build

# ===========================
# Phony Targets
# ===========================
.PHONY: \
	help dev build lint format test test-watch \
	db-migrate db-migrate-dev db-seed db-reset db-studio \
	deploy-prep
