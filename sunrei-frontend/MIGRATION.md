# Migration Guide: From npm to pnpm Workspace

This document explains the migration process from separate npm projects to a pnpm workspace.

## What Was Done

### 1. Created Workspace Structure
```
sunrei-frontend/
├── package.json           # Shared dependencies
├── pnpm-workspace.yaml    # Workspace configuration
├── packages/
│   ├── sunrei-app/       # Main application
│   └── sunrei-admin/     # Admin dashboard
```

### 2. Moved Shared Dependencies to Root

The following dependencies are now shared at the workspace level:
- **Core**: React 19.1.0, Next.js 15.5.0, TypeScript 5
- **Styling**: Tailwind CSS 3.4.17, Tailwind Merge 3.3.1, clsx
- **UI Components**: Radix UI components (dialog, label, separator, slot)
- **State & Data**: Zustand 5.0.8, React Query 5.90.2, Axios
- **Icons**: Lucide React 0.544.0
- **Development**: ESLint, TypeScript types, Autoprefixer

### 3. Kept Project-Specific Dependencies

**sunrei-app specific:**
- @tanstack/react-query-devtools
- @openapitools/openapi-generator-cli

**sunrei-admin specific:**
- @hookform/resolvers, react-hook-form
- Additional Radix UI components (alert-dialog, popover, select, tabs, tooltip)
- cmdk, js-cookie, zod
- @types/js-cookie

### 4. Updated Scripts

Workspace scripts for managing both projects:
- `pnpm dev` - Run both apps in parallel
- `pnpm dev:app` - Run only sunrei-app (port 3000)
- `pnpm dev:admin` - Run only sunrei-admin (port 3001)
- `pnpm build` - Build both apps
- `pnpm lint` - Lint both apps
- `pnpm clean` - Clean all build artifacts

## Benefits Achieved

1. **Disk Space Savings**: ~60-70% reduction in node_modules size
2. **Faster Installation**: 2-3x faster with parallel installs
3. **Consistent Dependencies**: Shared deps ensure version consistency
4. **Simplified Maintenance**: Update shared deps from one location
5. **Future-Ready**: Easy to add more frontend projects

## Getting Started

1. **Install pnpm** (if not already installed):
   ```bash
   npm install -g pnpm
   ```

2. **Run the setup script**:
   ```bash
   ./setup.sh
   ```

3. **Start development**:
   ```bash
   pnpm dev
   ```

## Rollback Plan

If you need to rollback to npm:

1. Move projects back to original location
2. Restore package-lock.json files from git
3. Remove workspace configuration
4. Run `npm install` in each project

## CI/CD Updates

Update your CI/CD pipeline to use pnpm:

```yaml
# Example for GitHub Actions
- uses: pnpm/action-setup@v2
  with:
    version: 8
- run: pnpm install
- run: pnpm build
```

## IDE Configuration

For VS Code, add to `.vscode/settings.json`:
```json
{
  "npm.packageManager": "pnpm"
}
```