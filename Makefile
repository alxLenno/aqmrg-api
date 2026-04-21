.PHONY: help setup install start stop restart logs clean test migrate seed

# Default target
help:
	@echo "AQMRG AI Analytics Backend - Available Commands"
	@echo "================================================"
	@echo "setup          - Initial project setup"
	@echo "install        - Install dependencies for all services"
	@echo "start          - Start all services with Docker Compose"
	@echo "stop           - Stop all services"
	@echo "restart        - Restart all services"
	@echo "logs           - View logs from all services"
	@echo "clean          - Clean up containers, volumes, and build artifacts"
	@echo "test           - Run all tests"
	@echo "test-unit      - Run unit tests"
	@echo "test-integration - Run integration tests"
	@echo "migrate        - Run database migrations"
	@echo "seed           - Seed development data"
	@echo "lint           - Run linters"
	@echo "format         - Format code"

# Initial setup
setup:
	@echo "Setting up AQMRG AI Backend..."
	cp .env.example .env
	@echo "Please edit .env file with your configuration"
	@echo "Run 'make install' to install dependencies"

# Install dependencies
install:
	@echo "Installing dependencies for all services..."
	cd services/api-gateway && npm install || true
	cd services/auth-service && npm install || true
	@echo "Dependencies installed"

# Start all services
start:
	@echo "Starting all services..."
	docker-compose up -d
	@echo "Services started. Access:"
	@echo "  API Gateway:  http://localhost:8000"
	@echo "  Grafana:      http://localhost:3000"
	@echo "  Prometheus:   http://localhost:9090"
	@echo "  Dashboard:    http://localhost:5173"
	@echo "  MLflow:       http://localhost:5000"

# Stop all services
stop:
	@echo "Stopping all services..."
	docker-compose down

# Restart all services
restart: stop start

# View logs
logs:
	docker-compose logs -f

# Clean up
clean:
	@echo "Cleaning up..."
	docker-compose down -v
	rm -rf node_modules
	rm -rf */node_modules
	rm -rf __pycache__
	rm -rf */__pycache__
	find . -type f -name "*.pyc" -delete
	@echo "Cleanup complete"

# Run all tests
test:
	@echo "Running all tests..."
	npm run test || true
	pytest tests/ || true

# Run unit tests
test-unit:
	@echo "Running unit tests..."
	npm run test:unit || true
	pytest tests/unit/ || true

# Run integration tests
test-integration:
	@echo "Running integration tests..."
	npm run test:integration || true
	pytest tests/integration/ || true

# Run database migrations
migrate:
	@echo "Running database migrations..."
	docker-compose exec postgres psql -U aqmrg -d aqmrg -f /docker-entrypoint-initdb.d/init.sql || true

# Seed development data
seed:
	@echo "Seeding development data..."
	docker-compose exec postgres psql -U aqmrg -d aqmrg -f /databases/postgres/seeds/seed.sql || true

# Lint code
lint:
	@echo "Running linters..."
	npm run lint || true
	pylint **/*.py || true

# Format code
format:
	@echo "Formatting code..."
	npm run format || true
	black . || true

# Deploy to staging
deploy-staging:
	@echo "Deploying to staging..."
	kubectl apply -f infrastructure/kubernetes/namespaces/staging.yaml
	kubectl apply -f infrastructure/kubernetes/deployments/ -n staging
	kubectl apply -f infrastructure/kubernetes/services/ -n staging

# Deploy to production
deploy-production:
	@echo "Deploying to production..."
	@echo "WARNING: This will deploy to PRODUCTION"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		kubectl apply -f infrastructure/kubernetes/namespaces/production.yaml; \
		kubectl apply -f infrastructure/kubernetes/deployments/ -n production; \
		kubectl apply -f infrastructure/kubernetes/services/ -n production; \
	fi

# Check service health
health:
	@echo "Checking service health..."
	curl -f http://localhost:8000/health || echo "API Gateway not responding"
	curl -f http://localhost:5000/health || echo "MLflow not responding"