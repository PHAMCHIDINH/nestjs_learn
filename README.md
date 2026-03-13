<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Documentation

Backend technical documentation is available in the `docs/` folder:

- `docs/README.md`
- `docs/BACKEND_TECH_STACK.md`
- `docs/ARCHITECTURE.md`
- `docs/AI_MODERATION.md`
- `docs/SERVERCN_BACKEND_IMPLEMENTATION_PLAN.md`

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run with Docker (Backend + PostgreSQL)

```bash
# from backend-repo folder
$ docker compose up -d --build
```

Services:

- Backend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

The backend container runs `prisma migrate deploy` automatically before starting, so committed migrations are applied on each container start. This keeps database tables in sync with the migration history when you run `docker compose up -d --build`.

If you also need demo data, run seed manually after the stack is up:

```bash
$ docker compose exec backend npm run db:seed
```

## Email Configuration for OTP

Set these variables in `backend-repo/.env` (or your shell env before `docker compose up`):

```bash
OTP_DELIVERY_MODE=email
MAIL_PROVIDER=auto
MAIL_FROM="Cho Sinh Vien <no-reply@example.com>"
RESEND_API_KEY=
RESEND_API_BASE_URL=https://api.resend.com

# SMTP only
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_FAMILY=4
SMTP_SECURE=false
SMTP_REQUIRE_TLS=false
SMTP_CONNECTION_TIMEOUT=10000
SMTP_GREETING_TIMEOUT=10000
SMTP_SOCKET_TIMEOUT=15000
SMTP_DNS_TIMEOUT=10000
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FAIL_FAST=false
SMTP_VERIFY_ON_STARTUP=false
```

Notes:

- `OTP_DELIVERY_MODE=manual` tam thoi bo qua email va tra `debugOtp` cho client o moi moi truong. Chi dung cho demo/test vi OTP se lo ra phia frontend.
- `MAIL_PROVIDER=auto` prefers Resend when `RESEND_API_KEY` is present, otherwise it falls back to SMTP when `SMTP_HOST` is configured.
- On Railway, prefer Resend because it uses HTTPS and avoids SMTP connectivity limits that commonly cause OTP requests to hang before returning `503`.
- In `NODE_ENV=production`, backend startup fails fast only when the selected mail provider config is invalid.
- If SMTP server is temporarily unreachable, backend continues running by default; set `SMTP_FAIL_FAST=true` to force startup failure on SMTP `verify` errors.
- `SMTP_VERIFY_ON_STARTUP=false` (default) skips blocking SMTP verify during boot to avoid startup delay/timeouts on platforms with cold starts.
- Set `SMTP_FAMILY=4` when your runtime cannot route IPv6 (common on some PaaS environments).
- You can omit `SMTP_USER`/`SMTP_PASS` only when your SMTP relay allows unauthenticated sends.

## Cloudinary Configuration for Listing Images

Set these variables in `backend-repo/.env`:

```bash
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=cho-sinh-vien/listings
```

## AI Moderation

Listing moderation v1 uses LangChain + OpenRouter through the OpenAI-compatible API.

Behavior:

- `AI_MODERATION_ENABLED=false`: listing flow stays unchanged.
- `AI_MODERATION_ENABLED=true`: backend enqueues moderation after create and after content edits.
- Moderation runs in the background via PostgreSQL-backed jobs.
- Only low-risk listings are auto-approved.
- Suspicious listings stay `PENDING` for admin review.
- Provider errors, parse errors, or timeouts do not fail the listing request; the listing stays `PENDING` and an audit row is written.

Required env when enabled:

```bash
AI_MODERATION_ENABLED=true
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODERATION_MODEL=openrouter/free
AI_MODERATION_TIMEOUT_MS=30000
AI_AUTO_APPROVE_CONFIDENCE_MIN=0.85
AI_MODERATION_PROVIDER_REQUIRE_PARAMETERS=true
AI_MODERATION_PROVIDER_SORT=latency
AI_MODERATION_PREFERRED_MAX_LATENCY_MS=20000
AI_MODERATION_ENABLE_RESPONSE_HEALING=true
OPENROUTER_HTTP_REFERER=https://your-admin-host.example
OPENROUTER_APP_TITLE=Cho Sinh Vien Backend
```

Related docs:

- `docs/AI_MODERATION.md`

Admin rerun endpoint is asynchronous now: it enqueues a moderation job and returns `jobStatus` instead of waiting for the model result.

Quick API test:

```bash
# health
$ curl http://localhost:3000/health
$ curl http://localhost:3000/health/liveness
$ curl http://localhost:3000/health/readiness

# swagger docs
$ open http://localhost:3000/docs

# register
$ curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@student.edu.vn\",\"password\":\"password123\",\"name\":\"Alice\",\"studentId\":\"20219999\",\"department\":\"cntt\"}"

# verify OTP (use code from email inbox, or debugOtp in dev/manual mode)
$ curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"alice@student.edu.vn\",\"code\":\"123456\"}"

# list listings
$ curl "http://localhost:3000/listings?page=1&limit=20"

# rerun AI moderation for a listing as admin
$ curl -X POST http://localhost:3000/admin/listings/<listing-id>/moderation/rerun \
  -H "Authorization: Bearer <admin-jwt>"
```

## Security / CORS

Set `CORS_ORIGIN` as a comma-separated allow-list in `.env` for production-like environments:

```bash
CORS_ORIGIN="https://app.example.com,https://admin.example.com"
```

Stop:

```bash
$ docker compose down
```

Stop and remove DB volume:

```bash
$ docker compose down -v
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
