# API

## Conventions

- **Base URL**: `https://api.codepawl.com/api/v1` in production, `http://localhost:8000/api/v1` in dev
- **Auth**: public endpoints (newsletter, contact, products) need no auth. Admin endpoints require header `X-Admin-Key: $ADMIN_API_KEY`. Future user endpoints will use Supabase JWT in `Authorization: Bearer <token>`
- **Content type**: `application/json` for both request and response
- **Error format**:
  ```json
  {
    "error": {
      "code": "validation_failed",
      "message": "Human-readable summary",
      "details": [
        {"field": "email", "issue": "must be a valid email"}
      ]
    }
  }
  ```
- **CORS**: allow `https://codepawl.com` and `https://www.codepawl.com` in production; `http://localhost:3000` in dev
- **Rate limit**: `slowapi` with IP-based limits. Public endpoints 30 req/min default, newsletter and contact 5 req/min per IP

## Endpoints

### `POST /newsletter/subscribe`

- **Purpose**: Begin newsletter signup. Inserts a pending subscriber and sends a confirmation email.
- **Auth**: public
- **Rate limit**: 5/min per IP
- **Request**:
  ```json
  {
    "email": "user@example.com",
    "source": "landing_footer",
    "turnstile_token": "0.abc..."
  }
  ```
- **Response 202**:
  ```json
  {"status": "pending_confirmation"}
  ```
- **Errors**:
  - `400 validation_failed`: malformed email, missing source, missing token
  - `400 turnstile_failed`: token did not verify with Cloudflare
  - `409 already_subscribed`: email already in `confirmed` state (response intentionally not leaking pending or expired status)
  - `429 rate_limited`

### `GET /newsletter/confirm`

- **Purpose**: Complete double opt-in.
- **Auth**: public, token-based
- **Rate limit**: 30/min per IP
- **Request**: query string `?token=...`
- **Response 200**:
  ```json
  {"status": "confirmed", "email": "user@example.com"}
  ```
- **Errors**:
  - `400 invalid_token`: token missing or malformed
  - `410 expired`: token was never valid, already confirmed, or older than 7 days

### `POST /newsletter/unsubscribe`

- **Purpose**: One-click unsubscribe per RFC 8058.
- **Auth**: public, token-based (separate unsubscribe token issued in every sent email's `List-Unsubscribe-Post` header)
- **Rate limit**: 30/min per IP
- **Request**:
  ```json
  {"token": "..."}
  ```
- **Response 200**:
  ```json
  {"status": "unsubscribed"}
  ```
- **Errors**:
  - `400 invalid_token`
  - `410 already_unsubscribed`

### `POST /contact`

- **Purpose**: Submit a contact form message. Persists the row and emails hello@codepawl.com.
- **Auth**: public
- **Rate limit**: 5/min per IP
- **Request**:
  ```json
  {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "subject": "Partnership inquiry",
    "message": "Body of the message...",
    "turnstile_token": "0.abc..."
  }
  ```
- **Response 201**:
  ```json
  {"status": "received", "id": "uuid"}
  ```
- **Errors**:
  - `400 validation_failed`: missing fields, message too short or too long
  - `400 turnstile_failed`
  - `429 rate_limited`

### `GET /products`

- **Purpose**: List all six products. Used by hero cycler and the products index page.
- **Auth**: public
- **Rate limit**: 60/min per IP
- **Response 200**:
  ```json
  {
    "products": [
      {
        "id": "openpawl",
        "name": "Openpawl",
        "slug": "openpawl",
        "tagline": "Open coordination runtime for coding agents.",
        "status": "beta",
        "github_repo": "codepawl/openpawl",
        "display_order": 1
      }
    ]
  }
  ```

### `GET /products/{slug}`

- **Purpose**: Single product detail.
- **Auth**: public
- **Response 200**: Same shape as one element of `GET /products`, no stats included.
- **Errors**: `404 not_found`

### `GET /products/{slug}/stats`

- **Purpose**: Latest cached GitHub stats for the product.
- **Auth**: public
- **Rate limit**: 60/min per IP
- **Response 200**:
  ```json
  {
    "product_id": "openpawl",
    "stars": 4200,
    "forks": 320,
    "open_issues": 27,
    "last_release_tag": "v0.4.1",
    "last_release_at": "2026-05-10T08:30:00Z",
    "synced_at": "2026-05-19T03:00:00Z"
  }
  ```
- **Errors**: `404 not_found` if product slug unknown

### `GET /health`

- **Purpose**: Liveness probe for Koyeb.
- **Auth**: public
- **Response 200**: `{"status": "ok", "version": "0.1.0"}`

### `GET /health/ready`

- **Purpose**: Readiness probe. Checks Supabase connectivity.
- **Auth**: public
- **Response 200**: `{"status": "ready", "db": "ok"}`
- **Response 503**: `{"status": "not_ready", "db": "error"}` if DB unreachable

### Admin endpoints

All admin endpoints require `X-Admin-Key: $ADMIN_API_KEY` header. Missing or wrong key returns `401`.

#### `POST /admin/products/sync-stats`

- **Purpose**: Manually trigger the GitHub stats sync job. Useful after a fresh release.
- **Request body**: empty or `{"product_ids": ["openpawl"]}` to scope
- **Response 202**: `{"status": "queued"}`

#### `GET /admin/newsletter/subscribers`

- **Purpose**: Paginated list of subscribers for admin browsing.
- **Query**: `?status=confirmed&page=1&per_page=50`
- **Response 200**: paginated list with totals

#### `GET /admin/contact/submissions`

- **Purpose**: Paginated list of contact submissions.
- **Query**: `?replied=false&page=1&per_page=50`
- **Response 200**: paginated list

#### `POST /admin/contact/submissions/{id}/reply`

- **Purpose**: Record that a submission has been replied to.
- **Request**:
  ```json
  {"replied_by": "AN", "reply_summary": "Sent partnership deck"}
  ```
- **Response 201**: created reply row

## OpenAPI doc

FastAPI auto-generates OpenAPI at `/openapi.json` and an interactive view at `/docs` (Swagger) and `/redoc`. In production, `/docs` and `/redoc` are gated behind the admin key.

TypeScript types for `packages/shared` are generated from `/openapi.json` via `openapi-typescript` during build.
