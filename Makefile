# ========================================
# Makefile for Node.js + Drizzle Projects
# ========================================
#
# What is this file?
# -------------------
# This Makefile defines shortcuts for common development,
# database, and deployment tasks. Instead of running long
# npm or drizzle commands manually, you can use simple
# commands like:
#
#   make dev
#   make build
#   make lint
#   make deploy-prep
#
# Why use Make?
# -------------
# - Simplifies common commands
# - Ensures consistency across developers and environments
# - Used by CI/CD pipelines (e.g., GitHub Actions)
#
# How to install Make on Ubuntu:
# ------------------------------
#   sudo apt update
#   sudo apt install make
#
# Verify installation:
#   make --version
#
# After installation, run:
#   make help
#
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
	@echo "  make db-generate     - Generate Drizzle migrations"
	@echo "  make db-migrate      - Run Drizzle migrations"
	@echo "  make db-check        - Check Drizzle schema"
	@echo "  make db-drop         - Drop the database"
	@echo "  make deploy-prep     - Prepare the project for deployment"
	@echo ""

# ===========================
# Development
# ===========================
dev:
	@echo "Starting development server..."
	npm run start:dev

# ===========================
# Build
# ===========================
build:
	@echo "Building the project..."
	npm run build

# ===========================
# Lint & Format
# ===========================
lint:
	@echo "Linting the project..."
	npm run lint

format:
	@echo "Formatting the project..."
	npm run format

# ===========================
# Tests
# ===========================
test:
	@echo "Running tests..."
	npm run test

test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

# ===========================
# Database (Drizzle)
# ===========================
db-generate:
	@echo "Generating Drizzle migrations..."
	npx drizzle-kit generate

db-migrate:
	@echo "Running Drizzle migrations..."
	npx drizzle-kit migrate

db-check:
	@echo "Checking Drizzle schema..."
	npx drizzle-kit check

db-drop:
	@echo "Dropping the database..."
	npx drizzle-kit drop

# ===========================
# Deployment
# ===========================
deploy-prep:
	@echo "Preparing for deployment..."
	npm ci
	npx drizzle-kit migrate
	npx drizzle-kit generate
	npm run build

# ===========================
# Phony Targets
# ===========================
.PHONY: \
	help dev build lint format test test-watch \
	db-generate db-migrate db-check db-drop \
	deploy-prep