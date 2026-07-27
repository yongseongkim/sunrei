---
name: api-protocol
description: Conventions for Sunrei API endpoints, request and response types, HTTP methods, response bodies, errors, and pagination. Use when adding or reviewing an API contract.
---

# Sunrei API Protocol

Follow REST conventions and document the API with OpenAPI 3.0.

- Request type: `{HttpMethod}{Name}Params` (e.g., `GetUserParams`, `ListUsersParams`)
- Response type: `{HttpMethod}{Name}Result` (e.g., `GetUserResult`, `ListUsersResult`)

## HTTP Method Rules

- Use `GET /sunreis/{id}` to retrieve one item.
- Use `GET /sunreis` to list items.
- Use `POST` to create an item.
- Use `PUT` for a full update.
- Use `PATCH` for a partial update.
- Use `DELETE` to delete an item.

## Response Format

- Success: `{ "data": ... }` or a domain key such as `{ "sunreis": [...] }`
- Error: `{ "error": { "code": "...", "message": "..." } }`
- Paginated list: `{ "items": [...], "nextToken": "..." }`
