# ServerCN Backend Implementation Plan

## 1. Muc tieu

Tai lieu nay mo ta ke hoach trien khai chi tiet de dua cac y tuong huu ich tu `servercn.vercel.app` vao backend hien tai trong `D:\base_code\backend-repo`.

Muc tieu chinh:

- Tang muc san sang production cho backend NestJS + Prisma.
- Chuan hoa cac concern cross-cutting: docs, error handling, logging, throttling, health check.
- Khong co gang nhung truc tiep `servercn-cli` vao repo NestJS neu registry khong ho tro that su.
- Trien khai theo tung phase nho, de test va rollback.

## 2. Ket qua nghien cuu ServerCN

### 2.1 Kien thuc can chot

- `servercn.vercel.app` la mot backend component registry va docs site.
- `servercn-cli` scaffold file/template vao project, khong phai backend runtime service.
- Ban npm hien tai da kiem tra: `servercn-cli@1.1.8`.
- Registry cong khai hien tai tap trung vao `express`.
- CLI co cho chon `nestjs`, nhung template registry thuc te chua ho tro day du.
- Da test truc tiep voi config `framework=nestjs`, lenh `npx servercn-cli add health-check` fail voi loi unsupported framework.

### 2.2 Ket luan ky thuat

Huong dung la:

- Khong tich hop `servercn-cli` truc tiep vao `backend-repo`.
- Chon loc cac pattern tot tu ServerCN.
- Viet lai theo NestJS-native architecture cua repo hien tai.

## 3. Trang thai hien tai cua backend

### 3.1 Stack

- Framework: NestJS 11
- ORM / DB access: Prisma + PostgreSQL
- Auth: JWT cookie/Bearer tu custom `AuthGuard`
- Validation: `ValidationPipe` global
- Mail: `nodemailer`

### 3.2 Nhung phan da co

- Auth module
- Roles guard
- Health endpoint co ban `GET /health`
- Prisma infrastructure
- Mail service

### 3.3 Nhung phan chua co hoac chua day du

- Swagger/OpenAPI
- Rate limiting
- Global exception filter chuan hoa response
- Response interceptor / response envelope thong nhat
- Structured logger cap app/request
- Health readiness/liveness theo chuan monitoring
- Security headers/CORS production policy ro rang
- Request ID / correlation ID

## 4. Scope trien khai de xuat

### 4.1 In-scope

- Swagger docs
- Rate limiting
- Global exception filter
- Response formatting strategy
- Structured logger
- Health check nang cao
- Security hardening muc can thiet cho API
- Test va tai lieu van hanh

### 4.2 Out-of-scope trong dot dau

- OAuth Google/GitHub
- File upload provider
- Background cron jobs khac business
- Full audit logging
- Distributed tracing
- Message queue

## 5. Mapping ServerCN sang NestJS hien tai

| ServerCN component | Gia tri tham khao | Cach map vao NestJS |
|---|---|---|
| `swagger-docs` | API docs | `@nestjs/swagger` + bootstrap config |
| `rate-limiter` | Gioi han request | `@nestjs/throttler` |
| `global-error-handler` | Chuan hoa loi | Global `ExceptionFilter` |
| `response-formatter` | Dinh dang response | Global `Interceptor` hoac convention co chon loc |
| `logger` | Logging co cau truc | `LoggerService` custom, uu tien `pino` hoac `winston` |
| `health-check` | Monitoring endpoint | `@nestjs/terminus` + Prisma indicator |
| `security-header` | Header an toan | `helmet` + CORS config chat hon |
| `verify-auth-middleware` / `rbac` | Bao ve route | Tai repo da co `AuthGuard` va `RolesGuard` |

## 6. Nguyen tac thuc hien

- Khong rewrite module business neu khong can.
- Thay doi theo chieu ngang, uu tien ha tang dung chung.
- Moi phase phai co tieu chi nghiem thu ro rang.
- Moi thay doi cross-cutting phai co smoke test.
- Khong thay doi contract API business neu chua thong nhat voi frontend.

## 7. Ke hoach trien khai chi tiet

## Phase 0 - Baseline va chot convention

### Muc tieu

Dong bang hien trang, chot cach response va logging truoc khi code.

### Cong viec

- Tao nhanh tai lieu quy uoc response thanh cong va response loi.
- Chot cach dat global prefix neu can, vi du `/api`.
- Chot quy uoc versioning: tam thoi giu khong version hoac them `/v1`.
- Kiem tra frontend hien tai dang goi endpoint theo prefix nao.
- Chot logger package:
  - Lua chon 1: `nestjs-pino`
  - Lua chon 2: `winston`
- Khuyen nghi: uu tien `nestjs-pino` neu muon log JSON gon, nhanh, de day vao log platform.

### File du kien

- [src/main.ts](D:/base_code/backend-repo/src/main.ts)
- [README.md](D:/base_code/backend-repo/README.md)
- [ARCHITECTURE.md](D:/base_code/backend-repo/ARCHITECTURE.md)

### Dau ra

- 1 convention doc ngan trong README hoac tai lieu rieng.
- Danh sach quyet dinh can khoa truoc khi vao Phase 1.

### Tieu chi xong

- Team thong nhat prefix, response strategy, logger strategy.

## Phase 1 - Swagger / OpenAPI

### Muc tieu

Them API docs de frontend, QA va van hanh co the tu kiem tra contract.

### Dependencies de xet

- `@nestjs/swagger`
- `swagger-ui-express`

### Cong viec

- Cau hinh Swagger trong bootstrap.
- Dat endpoint docs, vi du `/docs`.
- Khai bao title, description, version, auth scheme Bearer.
- Annotate cac endpoint auth, listing, conversation, admin o muc can thiet.
- Ghi ro cookie auth va Bearer auth de tranh hieu sai.

### File du kien

- [src/main.ts](D:/base_code/backend-repo/src/main.ts)
- [src/modules/auth/auth.controller.ts](D:/base_code/backend-repo/src/modules/auth/auth.controller.ts)
- [src/modules/listings/listings.controller.ts](D:/base_code/backend-repo/src/modules/listings/listings.controller.ts)
- [src/modules/conversations/conversations.controller.ts](D:/base_code/backend-repo/src/modules/conversations/conversations.controller.ts)
- [src/modules/admin/admin.controller.ts](D:/base_code/backend-repo/src/modules/admin/admin.controller.ts)

### Test

- Build thanh cong.
- Mo `/docs` local.
- Xac nhan endpoint private hien auth scheme.

### Tieu chi nghiem thu

- `/docs` render duoc.
- Swagger co mo ta cho cac endpoint chinh.
- Khong pha vo startup app.

## Phase 2 - Global exception filter va response envelope

### Muc tieu

Thong nhat hinh dang loi va giam su phan manh response.

### Quyet dinh can chot

- Co bao response thanh cong theo envelope chung hay giu raw payload?
- Khuyen nghi:
  - Loi: bat buoc thong nhat
  - Thanh cong: chi boc envelope neu backend va frontend deu san sang

### Cong viec

- Tao global `ExceptionFilter`.
- Normalize loi NestJS, Prisma va loi he thong.
- Tra ve cac truong co dinh:
  - `success`
  - `statusCode`
  - `message`
  - `errorCode`
  - `details`
  - `timestamp`
  - `path`
- Option A: them `ResponseInterceptor` cho response thanh cong.
- Option B: tam hoan response interceptor, chi thong nhat response loi.

### File du kien

- `src/common/filters/http-exception.filter.ts`
- `src/common/interceptors/response.interceptor.ts`
- [src/main.ts](D:/base_code/backend-repo/src/main.ts)
- `src/common/types/api-response.type.ts`

### Test

- 401 khi thieu token.
- 403 khi role khong hop le.
- 404 route sai.
- 400 validation loi.
- 500 khi nem loi he thong gia lap.

### Tieu chi nghiem thu

- Moi loi HTTP deu tra ve schema thong nhat.
- Frontend khong bi vo xu ly loi hien tai.

## Phase 3 - Rate limiting

### Muc tieu

Bao ve API khoi abuse, dac biet la auth va OTP.

### Dependencies de xet

- `@nestjs/throttler`

### Cong viec

- Cau hinh throttler global.
- Dat policy rieng cho cac route nhay cam:
  - `/auth/register`
  - `/auth/login`
  - `/auth/resend-otp`
  - `/auth/verify-otp`
- Dat nguong mac dinh cho public API va nguong chat hon cho auth API.
- Can nhac luu y khi deploy sau reverse proxy.

### File du kien

- [src/app.module.ts](D:/base_code/backend-repo/src/app.module.ts)
- `src/common/guards/throttler-behind-proxy.guard.ts`
- [src/modules/auth/auth.controller.ts](D:/base_code/backend-repo/src/modules/auth/auth.controller.ts)

### Test

- Goi lap lai login/register nhieu lan de xac nhan bi chan.
- Kiem tra response 429 on dinh.

### Tieu chi nghiem thu

- Auth endpoints co gioi han ro rang.
- Request hop le binh thuong khong bi anh huong dang ke.

## Phase 4 - Structured logger va request tracing

### Muc tieu

Co log de debug production, gom request lifecycle, error va performance co ban.

### Dependencies de xet

- Khuyen nghi: `nestjs-pino` + `pino`
- Lua chon thay the: `winston`

### Cong viec

- Tao logger module trong `core/logger`.
- Log cac su kien:
  - app start
  - request vao
  - response status + latency
  - exception
  - su kien mail send fail
- Them request ID / correlation ID.
- Dam bao khong log secret, password, JWT, OTP.
- Redact cac field nhay cam.

### File du kien

- `src/core/logger/logger.module.ts`
- `src/core/logger/logger.service.ts`
- `src/common/interceptors/logging.interceptor.ts`
- [src/main.ts](D:/base_code/backend-repo/src/main.ts)
- [src/core/mail/mail.service.ts](D:/base_code/backend-repo/src/core/mail/mail.service.ts)

### Test

- Chay local va doc log startup.
- Goi 1 request auth, 1 request loi, 1 request health.
- Kiem tra log co request ID va khong lo secret.

### Tieu chi nghiem thu

- Log doc duoc bang may va nguoi.
- Co the truy vet 1 request tu dau den cuoi.

## Phase 5 - Health check nang cao

### Muc tieu

Nang cap health endpoint tu muc co ban len muc dung duoc cho monitoring va deployment gating.

### Dependencies de xet

- `@nestjs/terminus`

### Cong viec

- Tach health thanh 3 endpoint:
  - `GET /health`
  - `GET /health/liveness`
  - `GET /health/readiness`
- Viet Prisma health indicator du tren `SELECT 1`.
- Co the bo sung memory/disk checks sau.
- Cap nhat Docker / deployment docs de dung readiness probe.

### File du kien

- [src/modules/health/health.module.ts](D:/base_code/backend-repo/src/modules/health/health.module.ts)
- [src/modules/health/controllers/health.controller.ts](D:/base_code/backend-repo/src/modules/health/controllers/health.controller.ts)
- [src/modules/health/services/health.service.ts](D:/base_code/backend-repo/src/modules/health/services/health.service.ts)
- `src/modules/health/services/prisma.health-indicator.ts`

### Test

- DB up -> readiness ok.
- Gia lap DB down -> readiness fail.
- Liveness van co the dung cho process check.

### Tieu chi nghiem thu

- Monitoring tool co the goi endpoint ro rang theo muc dich.

## Phase 6 - Security headers va CORS production policy

### Muc tieu

Giam rui ro default config qua mo, dac biet khi go production.

### Dependencies de xet

- `helmet`

### Cong viec

- Them `helmet`.
- Thu hep `origin: true` thanh whitelist env-based.
- Chot `credentials` policy.
- Kiem tra cookie settings phu hop same-site/secure.
- Tai lieu hoa env:
  - `CORS_ORIGIN`
  - `APP_BASE_URL`
  - `API_BASE_URL`

### File du kien

- [src/main.ts](D:/base_code/backend-repo/src/main.ts)
- [src/common/constants/auth.constants.ts](D:/base_code/backend-repo/src/common/constants/auth.constants.ts)
- [README.md](D:/base_code/backend-repo/README.md)
- [D:/base_code/DEPLOYMENT_GUIDE.md](D:/base_code/DEPLOYMENT_GUIDE.md)

### Test

- Frontend production domain goi duoc API.
- Origin la domain la bi chan neu khong nam trong whitelist.

### Tieu chi nghiem thu

- Production khong con `origin: true`.
- Auth cookie van hoat dong dung tren domain du kien.

## Phase 7 - Test, rollout, va tai lieu van hanh

### Muc tieu

Dam bao thay doi cross-cutting duoc kiem tra va team co tai lieu su dung.

### Cong viec

- Bo sung test e2e cho:
  - docs
  - health
  - auth throttling
  - error schema
- Cap nhat README cho local dev.
- Cap nhat deployment guide cho env moi.
- Viet checklist release.

### File du kien

- [test/jest-e2e.json](D:/base_code/backend-repo/test/jest-e2e.json)
- `test/app.e2e-spec.ts`
- [README.md](D:/base_code/backend-repo/README.md)
- [D:/base_code/DEPLOYMENT_GUIDE.md](D:/base_code/DEPLOYMENT_GUIDE.md)

### Tieu chi nghiem thu

- `npm run build` pass
- `npm run test` pass
- `npm run test:e2e` pass
- Smoke test local pass

## 8. Thu tu uu tien de thuc hien

Thu tu de xuat:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 5
6. Phase 6
7. Phase 4
8. Phase 7

Ly do:

- Swagger can som de nhin contract.
- Error schema can som de frontend xu ly dung.
- Throttling va health can som de giam rui ro production.
- Logger co the dat sau khi shape response va error da on.

## 9. Ke hoach file/folder de xuat

Co the bo sung cau truc sau ma khong pha vo modular architecture:

```text
src
|-- common
|   |-- filters
|   |   `-- http-exception.filter.ts
|   |-- interceptors
|   |   |-- logging.interceptor.ts
|   |   `-- response.interceptor.ts
|   `-- types
|       `-- api-response.type.ts
|-- core
|   `-- logger
|       |-- logger.module.ts
|       `-- logger.service.ts
`-- modules
    `-- health
        |-- controllers
        |   `-- health.controller.ts
        `-- services
            |-- health.service.ts
            `-- prisma.health-indicator.ts
```

## 10. Ranh gioi tuong thich voi frontend

Day la diem can can than nhat:

- Neu doi shape response thanh cong, frontend co the vo parsing.
- Neu doi prefix route, frontend co the goi sai URL.
- Neu thay doi auth cookie policy, browser co the khong gui cookie nua.

Khuyen nghi:

- Dot 1 chi thong nhat response loi.
- Giu nguyen payload thanh cong cho cac endpoint business.
- Chi them Swagger, throttling, health, logging, security hardening.

## 11. Rui ro va cach giam thieu

| Rui ro | Anh huong | Giam thieu |
|---|---|---|
| Swagger annotations ton cong suc | Trung binh | Annotate endpoint uu tien truoc |
| Response envelope pha frontend | Cao | Chi normalize loi trong dot dau |
| Throttling chan nham user that | Trung binh | Dat rule rieng cho auth, rule nhe cho public |
| Logger lo du lieu nhay cam | Cao | Redact secret/password/token/otp |
| CORS sai lam frontend 401/blocked | Cao | Test voi domain local va production truoc release |
| Health readiness sai lam fail deploy | Trung binh | Tach liveness/readiness ro rang |

## 12. Uoc tinh effort

| Phase | Effort uoc tinh |
|---|---|
| Phase 0 | 0.5 ngay |
| Phase 1 | 0.5 ngay |
| Phase 2 | 1 ngay |
| Phase 3 | 0.5 ngay |
| Phase 4 | 1 ngay |
| Phase 5 | 0.5 ngay |
| Phase 6 | 0.5 ngay |
| Phase 7 | 0.5 ngay |

Tong uoc tinh: `4.5 - 5 ngay lam viec`.

## 13. Definition of Done

Hoan thanh ke hoach nay khi:

- Backend co `/docs` hoat dong.
- Health check co `health`, `liveness`, `readiness`.
- Auth endpoints co throttling.
- Loi HTTP tra ve schema thong nhat.
- App co structured logging va request ID.
- CORS va security headers duoc config theo env.
- Build, test, e2e pass.
- README va deployment guide duoc cap nhat.

## 14. De xuat trien khai ngay

Neu bat dau code ngay, thu tu commit thuc te nen la:

1. Swagger
2. Global exception filter
3. Throttler cho auth
4. Health readiness/liveness
5. Helmet + CORS whitelist
6. Logger
7. Test + docs

Thu tu nay giam rui ro, it anh huong contract, va tao gia tri nhanh cho van hanh.
