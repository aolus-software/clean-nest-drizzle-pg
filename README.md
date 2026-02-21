# Clean Nest Drizzle PG

A production-ready **Clean Architecture** boilerplate built with [NestJS](https://nestjs.com/), [Drizzle ORM](https://orm.drizzle.team/), and [PostgreSQL](https://www.postgresql.org/).

---

## Features

- **Clean Architecture** - Separation of concerns with well-organized layers
- **Fastify** - High-performance HTTP server adapter
- **Drizzle ORM** - Type-safe and lightweight ORM for PostgreSQL
- **Authentication** - JWT-based auth with access & refresh tokens
- **Redis Caching** - Built-in caching with Redis via `cache-manager`
- **Email Service** - Nodemailer integration with Handlebars templates
- **API Documentation** - Swagger/OpenAPI with Scalar UI
- **Rate Limiting** - Request throttling with `@nestjs/throttler`
- **Health Checks** - Readiness and liveness probes via `@nestjs/terminus`
- **Background Jobs** - BullMQ for async task processing
- **Docker Ready** - Pre-configured Docker Compose setup
- **Testing** - Jest setup for unit & e2e tests

---

## Tech Stack

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| **Runtime**   | [Bun](https://bun.sh/) / [Node.js](https://nodejs.org/)                    |
| **Framework** | [NestJS](https://nestjs.com/) with [Fastify](https://fastify.dev/) adapter |
| **ORM**       | [Drizzle ORM](https://orm.drizzle.team/)                                   |
| **Database**  | [PostgreSQL 17](https://www.postgresql.org/)                               |
| **Cache**     | [Redis 8](https://redis.io/)                                               |
| **Queue**     | [BullMQ](https://bullmq.io/)                                               |
| **Auth**      | [Passport.js](http://www.passportjs.org/) + JWT                            |
| **Docs**      | [Swagger](https://swagger.io/) + [Scalar](https://scalar.com/)             |

---

## Project Structure

```
├── src/
│   ├── auth/                 # Authentication module
│   ├── health/               # Health check endpoints
│   ├── settings/             # Settings module (users, roles, permissions)
│   ├── app.module.ts         # Root application module
│   └── main.ts               # Application entry point
├── libs/
│   ├── common/               # Shared utilities, guards, pipes, decorators
│   ├── config/               # App configuration, env validation, CORS/Helmet/Swagger configs
│   ├── repositories/         # Database schemas, migrations, repositories
│   └── utils/                # Helper utilities
├── docker-compose.yml        # Docker services configuration
├── drizzle.config.ts         # Drizzle ORM configuration
├── Makefile                  # Development commands
└── package.json
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0 or [Node.js](https://nodejs.org/) >= 18.0.0
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/aolus-software/clean-nest-drizzle-pg.git
   cd clean-nest-drizzle-pg
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Update `.env` with your configuration:

   ```env
   APP_NAME="Clean Nest"
   APP_VERSION="1.0.0"
   APP_SECRET=your_secret_key_here
   APP_PORT=8002

   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db

   FRONTEND_URL=http://localhost:3000

   JWT_SECRET=your_jwt_secret
   JWT_REFRESH_SECRET=your_refresh_secret
   JWT_EXPIRES_IN=1d
   JWT_REFRESH_EXPIRES_IN=7d

   REDIS_HOST=localhost
   REDIS_PORT=6379

   ALLOWED_ORIGINS=http://localhost:3000
   ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
   ALLOWED_HEADERS=Content-Type,Authorization
   CREDENTIALS=false

   # Mail Configuration (optional)
   MAIL_HOST=
   MAIL_PORT=
   MAIL_SECURE=false
   MAIL_USERNAME=
   MAIL_PASSWORD=
   MAIL_FROM="noreply@example.com"
   MAIL_DEFAULT_SUBJECT="Clean Nest"
   ```

4. **Start Docker services**

   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL 17 on port `5432`
   - Redis 8 on port `6379`

5. **Run database migrations**

   ```bash
   make db-migrate-dev
   ```

6. **Start the development server**

   ```bash
   make dev
   ```

7. **Access the application**
   - API: http://localhost:8001
   - API Documentation: http://localhost:8001/docs

---

## Makefile Commands

Run `make help` to see all available commands:

| Command               | Description                               |
| --------------------- | ----------------------------------------- |
| `make dev`            | Start the development server              |
| `make build`          | Build the project                         |
| `make lint`           | Lint the project                          |
| `make format`         | Format the project                        |
| `make test`           | Run tests                                 |
| `make test-watch`     | Run tests in watch mode                   |
| `make db-migrate`     | Run database migrations (prod)            |
| `make db-migrate-dev` | Run database migrations (dev)             |
| `make db-seed`        | Run database seeder                       |
| `make db-reset`       | Reset database                            |
| `make db-studio`      | Start drizzle-kit Studio                  |
| `make deploy-prep`    | Prepare the project for deployment        |

---

## Scripts

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `bun run start:dev`  | Start in development mode (watch)     |
| `bun run start:prod` | Start in production mode              |
| `bun run build`      | Build for production                  |
| `bun run lint`       | Lint and fix code                     |
| `bun run format`     | Format code with Prettier             |
| `bun run test`       | Run unit tests                        |
| `bun run test:e2e`   | Run end-to-end tests                  |
| `bun run test:cov`   | Run tests with coverage               |

---

## Docker Services

The `docker-compose.yml` includes:

| Service      | Image         | Port  | Description                    |
| ------------ | ------------- | ----- | ------------------------------ |
| **postgres** | postgres:17   | 5432  | PostgreSQL database            |
| **redis**    | redis:8       | 6379  | Redis cache & queue backend    |

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f
```

---

## API Documentation

Once the application is running, access the interactive API documentation at:

- **Scalar UI**: http://localhost:8001/docs

The documentation includes all available endpoints, request/response schemas, and authentication setup.

---

## Database Management

This project uses Drizzle ORM with Drizzle Kit for migrations.

```bash
# Generate migrations
bunx --bun drizzle-kit generate

# Run migrations
bunx --bun drizzle-kit migrate

# Open Drizzle Studio
make db-studio
```

---

## Testing

```bash
# Unit tests
bun run test

# Watch mode
bun run test:watch

# Coverage
bun run test:cov

# E2E tests
bun run test:e2e
```

---

## Deployment

Prepare for production:

```bash
make deploy-prep
```

This will install dependencies with frozen lockfile, run database migrations, and build the production bundle.

Start in production:

```bash
bun run start:prod
```

---

## Environment Variables

| Variable                 | Description                        | Default                      |
| ------------------------ | ---------------------------------- | ---------------------------- |
| `APP_NAME`               | Application name                   | `clean nest`                 |
| `APP_VERSION`            | Application version                | `1.0.0`                      |
| `APP_SECRET`             | Application secret key             | -                            |
| `APP_PORT`               | Server port                        | `8002`                       |
| `APP_URL`                | Application URL                    | `localhost:8002`             |
| `APP_TIMEZONE`           | Application timezone               | `UTC`                        |
| `NODE_ENV`               | Environment                        | `development`                |
| `FRONTEND_URL`           | Frontend application URL           | `http://localhost:3000`      |
| `DATABASE_URL`           | PostgreSQL connection string       | -                            |
| `JWT_SECRET`             | JWT signing secret                 | -                            |
| `JWT_REFRESH_SECRET`     | Refresh token secret               | -                            |
| `JWT_EXPIRES_IN`         | Access token expiry                | `1d`                         |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry               | `7d`                         |
| `THROTTLER_TTL`          | Rate limit window (seconds)        | `60`                         |
| `THROTTLER_LIMIT`        | Max requests per window            | `60`                         |
| `ALLOWED_ORIGINS`        | Comma-separated allowed CORS origins | `*`                        |
| `ALLOWED_METHODS`        | Comma-separated allowed HTTP methods | `GET,POST,PUT,PATCH,DELETE,OPTIONS` |
| `ALLOWED_HEADERS`        | Comma-separated allowed headers    | `Content-Type,Authorization` |
| `MAX_AGE`                | CORS preflight cache duration (s)  | `3600`                       |
| `CREDENTIALS`            | Allow credentials in CORS          | `false`                      |
| `REDIS_HOST`             | Redis host                         | `localhost`                  |
| `REDIS_PORT`             | Redis port                         | `6379`                       |
| `REDIS_PASSWORD`         | Redis password                     | -                            |
| `REDIS_TTL`              | Cache TTL in seconds               | `3600`                       |
| `MAIL_HOST`              | SMTP host                          | -                            |
| `MAIL_PORT`              | SMTP port                          | -                            |
| `MAIL_SECURE`            | Use TLS for SMTP                   | `false`                      |
| `MAIL_USERNAME`          | SMTP username                      | -                            |
| `MAIL_PASSWORD`          | SMTP password                      | -                            |
| `MAIL_FROM`              | Default sender email               | -                            |
| `MAIL_DEFAULT_SUBJECT`   | Default email subject              | `Clean Nest`                 |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License
Copyright (c) 2025 Aolus Software
```
