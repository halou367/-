# Release Artifact Distribution Worker

Cloudflare Worker for serving signed client release metadata (`/latest`, `/beta/latest`) and authenticated artifact download tickets (`/ticket`).

## Endpoints

- `GET /latest`: Returns latest stable release version and asset metadata.
- `GET /beta/latest`: Returns latest pre-release version and asset metadata.
- `POST /ticket`: Validates device authorization token and returns a short-lived download URL.
