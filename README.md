# Team9-2API

Team9-2API is a **Team9 -> OpenAI-compatible** proxy with:

- protected `GET /v1/models`
- protected `POST /v1/chat/completions`
- **both non-stream and stream support**
- authenticated sketch-style admin WebUI
- Docker / GHCR / Zeabur deployment path

## Features

- **Canonical model IDs** that prefer real names like `chatgpt`, `gemini`, and `claude`
- **Authenticated admin UI** for model discovery, refresh, and prompt probing
- **Authenticated proxy API** using a single admin key
- **OpenAI-compatible SSE streaming** for `stream=true`
- **Team9 polling adapter** that filters status-only messages such as `Execution complete.`

## Auth Model

- `GET /healthz` is public
- All other routes require auth
- Proxy routes require:

```http
Authorization: Bearer <ADMIN_API_KEY>
```

- Admin WebUI uses the same key on the login page and receives an httpOnly session cookie

## Environment Variables

See `.env.example`.

Real secrets must **not** be committed to git. In production, put them in **Zeabur Variables** only.

## Local Development

```bash
npm install
npm test
npm run dev
```

Default local address:

```text
http://127.0.0.1:3000
```

## API

### Health

```http
GET /healthz
```

### Models

```http
GET /v1/models
Authorization: Bearer <ADMIN_API_KEY>
```

### Chat Completions

```http
POST /v1/chat/completions
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
```

Example request:

```json
{
  "model": "claude",
  "stream": true,
  "messages": [
    { "role": "user", "content": "Say hello." }
  ]
}
```

## Admin WebUI

- `/login`
- `/admin`

Protected admin APIs:

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET /api/admin/models`
- `POST /api/admin/models/discover`
- `POST /api/admin/models/refresh`
- `POST /api/admin/probe/send`

## Docker

Build locally:

```bash
docker build -t team9-2api:local .
```

Run locally:

```bash
docker run --rm -p 3000:3000 --env-file .env team9-2api:local
```

## GHCR

The repo includes `.github/workflows/ghcr.yml`, which publishes:

```text
ghcr.io/thewisewolfholo/team9-2api:latest
```

## Zeabur CLI Deployment

Recommended path:

1. Push to GitHub
2. Wait for GHCR image build
3. Use Zeabur CLI to create a service from the GHCR image
4. Mount a volume to `/app/data`
5. Set all runtime secrets in Zeabur Variables
6. Expose a domain and verify `/healthz`, `/v1/models`, and `/v1/chat/completions`

## Security Notes

- No real Team9 tokens, refresh tokens, tenant IDs, admin keys, or session secrets should appear in:
  - repo files
  - README examples
  - GitHub Actions plaintext
  - Docker build args
  - frontend bundles
- GHCR images should contain **code only**, not runtime secrets
Team9 to OpenAI-compatible proxy with authenticated admin web UI, GHCR packaging, and Zeabur deployment support.
