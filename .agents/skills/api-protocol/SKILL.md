---
name: api-protocol
description: Conventions for Sunrei API endpoints, request and response types, HTTP methods, response bodies, errors, and pagination. Use when adding or reviewing an API contract.
---

# Sunrei API Protocol

Use `sunrei-api/app-api-spec.yaml` and `sunrei-api/admin-api-spec.yaml` as the
contract. Follow [the project code-generation rules](../../../AGENTS.md):
change the spec first, regenerate DTOs, and never edit generated clients by
hand.

Reuse the schema and operation names already established in the relevant
spec: `CreateSunreiRequest`, `UpdatePlaceRequest`, domain `*DTO` types, and
`List*Result` / `Get*Result` where present.

## HTTP Method Rules

- Use the declared `/api/*` or `/admin/*` prefix; the two surfaces have
  different payloads and permissions.
- Use `GET` to retrieve an item or list resources.
- Use `POST` to create an item.
- Prefer `PATCH` for new partial-update operations, while preserving existing
  endpoint semantics. `PUT /admin/sunreis/{id}` updates only supplied
  top-level fields, but a supplied `spots` list replaces membership: an
  omitted live spot is soft-deleted. `PATCH /admin/places/{id}` changes only
  supplied fields and requires latitude and longitude together.
- Use `DELETE` to delete an item.

## Response Format

Follow each endpoint's declared response; there is no universal envelope.

- Admin detail and create endpoints can return a domain DTO directly.
  Public endpoints use domain-specific results such as `{ "sunrei": ... }`,
  `{ "sources": [...] }`, or a bare array for `/api/tags`.
- Paginated admin lists such as `/admin/sunreis` use
  `{ "data": [...], "totalSize": 20, "totalElements": 100, "nextToken": "..." }`.
  Follow `nextToken` until absent; do not assume every admin list is paginated.
- Existing admin error handlers return `{ "error": "message" }`; conflicts
  may also include `existingId`. Check the route and declared HTTP statuses
  rather than inventing a nested `code` / `message` envelope.
- Successful creation normally returns 201 and deletion 204; use the
  endpoint's specified result rather than wrapping every success in `data`.
