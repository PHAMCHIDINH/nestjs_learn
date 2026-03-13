# AI Moderation

## Muc tieu

Tinh nang nay them lop moderation cho noi dung listing bang AI theo huong an toan:

- V1 chi moderation text.
- Chi `auto-approve` bai `low risk`.
- Moi truong hop con lai giu `PENDING` de admin quyet dinh.
- Moderation chay nen bang PostgreSQL job queue, khong block request create/update listing.

## Kien truc

- `AiModule`
  - `AiModerationService`: goi OpenRouter qua `@langchain/openai`, yeu cau structured output, gan provider routing va response-healing.
  - `ModerationPolicyService`: rule co dinh cho moderation.
  - `ModerationAuditService`: ghi audit vao `listing_moderation_runs`.
  - `ListingModerationWorkflowService`: ap business rule, auto-approve va gui notification.
  - `ListingModerationJobService`: enqueue/claim/retry/fail/complete moderation jobs.
  - `ListingModerationWorkerService`: poll PostgreSQL va xu ly moderation nen.
- `ListingsService`
  - Sau `create` hoac `update` noi dung, listing duoc luu truoc.
  - Neu feature bat, he thong chi enqueue job moderation.
- `AdminService`
  - `GET /admin/listings/pending` tra them `latestModeration` va `moderationJobStatus`.
  - `POST /admin/listings/:id/moderation/rerun` chi enqueue moderation lai, khong cho ket qua AI dong bo.

## Luong xu ly

### Tao bai dang

1. Listing duoc tao voi `approvalStatus=PENDING`.
2. Neu `AI_MODERATION_ENABLED=true`, backend tao hoac reset `listing_moderation_jobs`.
3. Worker poll job theo chu ky ngan.
4. Worker load snapshot listing hien tai va goi OpenRouter thong qua LangChain.
5. Ket qua duoc ghi vao `listing_moderation_runs`.
6. Neu ket qua dat dieu kien:
   - `riskLevel=low`
   - `confidence >= AI_AUTO_APPROVE_CONFIDENCE_MIN`
   - `violations=[]`
   - `recommendedAction=approve`
     thi listing duoc `APPROVED` tu dong va gui notification.
7. Neu khong dat dieu kien, listing giu `PENDING`.

### Sua bai dang

- Neu thay doi `title`, `description`, `category`, hoac `department`, listing duoc reset ve `PENDING` roi enqueue moderation lai.
- Neu chi doi gia, anh, hoac `status` ban hang, moderation khong chay lai.

### Retry va fallback

- Retry chi ap dung cho loi `TIMEOUT` va `PROVIDER`.
- Queue retry toi da 3 lan voi backoff tang dan.
- Neu provider loi, timeout, hoac parse output khong hop le:
  - request create/update listing van thanh cong;
  - listing giu `PENDING`;
  - audit duoc ghi voi `riskLevel=error`.

## Rule moderation v1

- `hang_hoa_cam`: dau hieu hang hoa/dich vu trai phep, vat pham bi cam.
- `spam_lua_dao`: spam, lua dao, dat coc dang ngo, gia tri phi thuc te ro rang.
- `noi_dung_doc_hai`: noi dung thu ghet, khieu dam, bao luc ro rang.
- `dieu_huong_giao_dich_ngoai_nen_tang`: dau hieu manh ve viec ne he thong, day nguoi dung giao dich ben ngoai.

V1 khong moderation:

- anh
- report moderation
- auto-reject

## Database

### Audit table

Bang `listing_moderation_runs` luu:

- `listingId`
- `model`
- `inputHash`
- `riskLevel`
- `confidence`
- `violationsJson`
- `summary`
- `recommendedAction`
- `appliedAction`
- `status`
- `processingMs`
- `failureType`
- `errorMessage`
- `createdAt`

`failureType` co the la:

- `TIMEOUT`
- `PROVIDER`
- `PARSE`
- `UNKNOWN`

### Job table

Bang `listing_moderation_jobs` luu:

- `listingId`
- `status`: `PENDING | RUNNING | COMPLETED | FAILED`
- `revision`: tranh stale worker de ket qua cu khong ghi de len job moi
- `attemptCount`
- `nextRunAt`
- `lastError`
- `createdAt`
- `updatedAt`

## Payload cho admin

`latestModeration` trong payload listing pending:

```json
{
  "riskLevel": "low",
  "confidence": 0.93,
  "recommendedAction": "approve",
  "summary": "No obvious violation.",
  "violations": [],
  "createdAt": "2026-03-13T00:00:00.000Z"
}
```

`moderationJobStatus` trong payload listing pending:

```json
"pending" | "running" | "completed" | "failed"
```

## Cau hinh

```bash
AI_MODERATION_ENABLED=false
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODERATION_MODEL=openrouter/free
AI_MODERATION_TIMEOUT_MS=30000
AI_AUTO_APPROVE_CONFIDENCE_MIN=0.85
AI_MODERATION_PROVIDER_REQUIRE_PARAMETERS=true
AI_MODERATION_PROVIDER_SORT=latency
AI_MODERATION_PREFERRED_MAX_LATENCY_MS=20000
AI_MODERATION_ENABLE_RESPONSE_HEALING=true
OPENROUTER_HTTP_REFERER=
OPENROUTER_APP_TITLE=
```

Luu y:

- Khi `AI_MODERATION_ENABLED=true`, `OPENROUTER_API_KEY` bat buoc phai co.
- `AI_MODERATION_MODEL` mac dinh la `openrouter/free`.
- `AI_MODERATION_PREFERRED_MAX_LATENCY_MS` duoc luu theo ms trong env, sau do backend doi sang giay de gui cho OpenRouter.
- `OPENROUTER_APP_TITLE` duoc gui qua header `X-Title`.

## API admin

### Lay danh sach cho duyet

`GET /admin/listings/pending`

- Moi item co them:
  - `latestModeration`
  - `moderationJobStatus`

### Chay lai moderation

`POST /admin/listings/:id/moderation/rerun`

Response mau:

```json
{
  "message": "Listing moderation rerun queued",
  "listingId": "abc123",
  "jobStatus": "pending"
}
```

Neu job hien tai dang chay, response co the la:

```json
{
  "message": "Listing moderation rerun queued",
  "listingId": "abc123",
  "jobStatus": "running"
}
```

## Debug va van hanh

Kiem tra nhanh:

1. Xac nhan env trong container:
   - `AI_MODERATION_ENABLED=true`
   - `OPENROUTER_API_KEY`
   - `AI_MODERATION_MODEL`
2. Xem audit moi nhat:
   - bang `listing_moderation_runs`
3. Xem queue:
   - bang `listing_moderation_jobs`

Can luu y cac nhom loi:

- `failureType=TIMEOUT`
  - thu tang timeout
  - chon model free nhanh hon
- `failureType=PROVIDER`
  - kiem tra key, rate limit, networking, model availability
- `failureType=PARSE`
  - model tra output khong on dinh
  - uu tien giu `response-healing=true`

Rollback nhanh:

- Dat `AI_MODERATION_ENABLED=false`
- Deploy lai backend

Luc nay flow moderation se dung enqueue job va he thong quay ve duyet tay thong thuong.
