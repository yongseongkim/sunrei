# Sunrei Admin

Admin dashboard for Sunrei project.

## Getting Started

```bash
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001)

## Auth Flow

- Google OAuth login (admin only)
- Non-admin users redirected to `/forbidden`
- JWT stored in cookie, Bearer token for API requests

## Pages

| Route | Description |
|-------|-------------|
| `/login` | Google OAuth login |
| `/forbidden` | Access denied (non-admin) |
| `/` | Dashboard (admin only) |
