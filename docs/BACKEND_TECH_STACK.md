# Backend Tech Stack

This document describes the current backend stack in `backend-repo`, why each part exists, and where it is used.

## 1. Core Runtime Stack

- Runtime: `Node.js`
- Language: `TypeScript`
- Framework: `NestJS 11`
- Transport: `HTTP` via `@nestjs/platform-express`

Why:

- NestJS provides a clean module system for domain separation.
- TypeScript improves maintainability across DTOs, services, and data mapping.

## 2. Application Architecture

- Architecture style: modular domain-driven structure
- Main folders:
  - `src/modules/*`: business domains (`auth`, `listings`, `users`, etc.)
  - `src/common/*`: shared guards, filters, interceptors, decorators, and types
  - `src/core/*`: infrastructure services (database, mail, etc.)

Reference: `docs/ARCHITECTURE.md`.

## 3. Data Layer

- Database: `PostgreSQL`
- ORM: `Prisma`
- Prisma adapter: `@prisma/adapter-pg`
- DB driver: `pg`

Usage:

- Prisma is injected through `PrismaService`.
- Domain services use Prisma for queries/transactions.

## 4. Authentication and Authorization

- Auth strategy: JWT-based auth
- Token handling:
  - Bearer token support
  - HTTP cookie support (`access_token`)
- Password hashing: `bcryptjs`
- Access control:
  - `AuthGuard` for authentication
  - `RolesGuard` + `@Roles()` for role-based authorization

## 5. API Layer and Contract

- Validation:
  - `class-validator`
  - `class-transformer`
  - global `ValidationPipe` with whitelist/transform
- API docs: `@nestjs/swagger` + `swagger-ui-express`
- Docs endpoint: `/docs`

## 6. Reliability and Security

- Security headers: `helmet`
- CORS:
  - environment-driven allowlist (`CORS_ORIGIN`)
  - stricter production behavior
- Rate limiting: `@nestjs/throttler`
  - global throttling policy
  - stricter per-route throttling on sensitive auth endpoints
- Health checks: `@nestjs/terminus`
  - `/health`
  - `/health/liveness`
  - `/health/readiness`

## 7. Error Handling and Observability

- Global exception handling:
  - custom `HttpExceptionFilter`
  - standardized error response payload
- Request logging:
  - global `LoggingInterceptor`
  - request id propagation via `x-request-id` header
- Mail diagnostics:
  - `Logger` usage inside `MailService`

## 8. Background Integrations

- Email transport: `nodemailer`
- SMTP config via environment variables:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`

## 9. Testing and Quality

- Unit testing: `Jest`
- E2E testing: `Jest` + `supertest`
- Linting: `ESLint`
- Formatting: `Prettier`

## 10. Build and Deployment Tooling

- Build: `nest build`
- Local container workflow: `Dockerfile` + `docker-compose.yml`
- Database migrations:
  - `prisma migrate dev`
  - `prisma migrate deploy`

## 11. Package Summary (Key)

Core:

- `@nestjs/common`
- `@nestjs/core`
- `@nestjs/platform-express`
- `@nestjs/config`

API and security:

- `@nestjs/swagger`
- `swagger-ui-express`
- `@nestjs/throttler`
- `helmet`

Health and resilience:

- `@nestjs/terminus`

Data:

- `@prisma/client`
- `prisma`
- `@prisma/adapter-pg`
- `pg`

Auth and validation:

- `@nestjs/jwt`
- `bcryptjs`
- `class-validator`
- `class-transformer`

Integrations:

- `nodemailer`

## 12. Known Direction

The current stack is already production-oriented for a typical CRUD + auth backend.

Near-term improvements can focus on:

- deeper API schema annotations in Swagger
- stricter response contract for successful payloads (if frontend alignment is complete)
- monitoring integration (external log aggregation and alerting)
