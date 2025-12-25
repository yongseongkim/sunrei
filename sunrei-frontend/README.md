# Sunrei Frontend Workspace

This is a pnpm workspace containing the Sunrei frontend applications.

## Structure

- `packages/sunrei-app` - Main Sunrei application
- `packages/sunrei-admin` - Admin dashboard

## Getting Started

### Prerequisites

Install pnpm globally:
```bash
npm install -g pnpm
```

### Installation

Install all dependencies:
```bash
pnpm install
```

### Development

Run both applications in parallel:
```bash
pnpm dev
```

Run individual applications:
```bash
pnpm dev:app      # Runs on port 3000
pnpm dev:admin    # Runs on port 3001
```

### Build

Build all applications:
```bash
pnpm build
```

Build individual applications:
```bash
pnpm build:app
pnpm build:admin
```

### Lint

Lint all applications:
```bash
pnpm lint
```

### Clean

Clean all build artifacts and node_modules:
```bash
pnpm clean
```

## Code Generation

Generate API clients for both applications:
```bash
pnpm codegen
```

## Benefits of Using pnpm Workspaces

- **60-70% less disk space**: Shared dependencies are deduplicated
- **2-3x faster installs**: Parallel installation with efficient caching
- **Consistent versions**: Shared dependencies ensure version consistency
- **Easy dependency management**: Update shared dependencies from one location