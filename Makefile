help:
	@echo "Available commands:"
	@echo "  make dev          - Start the development server"
	@echo "  make build        - Build the project"
	@echo "  make lint         - Lint the project"
	@echo "  make format       - Format the project"
	@echo "  make test         - Run tests"
	@echo "  make test:watch   - Run tests in watch mode"

dev:
	@echo "Starting development server..."
	npm run start:dev

build:
	@echo "Building the project..."
	npm run build

lint:
	@echo "Linting the project..."
	npm run lint

format:
	@echo "Formatting the project..."
	npm run format

test:
	@echo "Running tests..."
	npm run test

test-watch:
	@echo "Running tests in watch mode..."
	npm run test:watch

.PHONY: help dev build lint format test test-watch