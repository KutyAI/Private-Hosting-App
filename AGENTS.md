# AGENTS.md - Development Guidelines

## Commands

### Install
```bash
npm install                    # Install all workspace deps
```

### Build
```bash
npm run build --workspaces     # Build all packages
npm run build -w packages/shared-types   # Build first (dependency)
npm run build -w apps/backend-api
npm run build -w apps/host-agent
npm run build -w apps/relay-service
npm run build -w apps/desktop-ui
npm run tauri:build -w apps/desktop-ui   # Build Windows installer
```

### Dev Servers
```bash
npm run dev                    # Start all 3 services concurrently
npm run dev:api                # Backend API (port 3001)
npm run dev:agent              # Host agent (port 9876)
npm run dev:ui                 # Desktop UI (port 3000)
npm run tauri:dev -w apps/desktop-ui     # Tauri dev mode
```

### Tests
```bash
npm test --workspaces          # Run all tests
npm test -w packages/shared-types
npm test -w apps/backend-api
npm test -w apps/desktop-ui
npm test -w apps/backend-api -- --watch           # Watch mode
npm test -w apps/backend-api -- test/auth         # Single test file
npm test -w apps/desktop-ui -- --watch            # Vitest watch mode
node scripts/e2e-smoke-test.js                    # E2E smoke test (services must be running)
node scripts/load-test.js                         # API load test
node scripts/relay-load-test.js                   # Relay stress test
node scripts/benchmarks.js                        # Performance benchmarks
```

## Monorepo Structure

```
apps/
├── backend-api/          # Express.js + better-sqlite3 (port 3001)
├── host-agent/           # Node.js agent + WebSocket IPC (port 9876)
├── relay-service/        # WebSocket relay server (port 8443)
└── desktop-ui/           # Vite + React + TypeScript + Tailwind (port 3000)
packages/
└── shared-types/         # Shared TypeScript interfaces/types
scripts/                  # Load tests, benchmarks, E2E tests, build scripts
docs/                     # User guide, deployment, privacy, terms
```

## Code Style

### Imports
- Use ES module imports (`import { x } from 'y'`)
- Group imports: stdlib → third-party → internal → relative
- Use `@mc-host/shared-types` for cross-package types
- No barrel re-exports; import directly from source

### Formatting
- 2-space indentation
- Single quotes for strings, double for JSX
- Semicolons required
- Trailing commas in multiline objects/arrays
- Max line length: 120 chars

### TypeScript
- `strict: true` in all tsconfigs
- No `any` — use `unknown` or proper types
- Prefer interfaces for object shapes, types for unions
- Explicit return types on public functions
- Use `as` casts sparingly; prefer type guards

### Naming Conventions
- **Files**: kebab-case (`server-manager.ts`)
- **Components**: PascalCase (`Dashboard.tsx`)
- **Variables/functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Types/interfaces**: PascalCase
- **IPC commands**: dot-notation (`server.create`, `guest.join`)

### Error Handling
- Never swallow errors — log or rethrow
- Use typed error classes for domain errors
- API: return proper HTTP status codes with JSON error bodies
- Agent: catch and log, surface to UI via IPC responses
- UI: use ErrorBoundary for React errors, message state for user-facing errors

### Async Patterns
- Always `await` Promises; never leave unhandled rejections
- Use `Promise.allSettled` for parallel operations that shouldn't fail together
- Set timeouts on network operations (STUN: 3s, relay: 8s, API: 10s)

### Security
- Never commit secrets or tokens
- Use `process.env` for configuration
- Validate all IPC command params before use
- Rate limit all public API endpoints
- Sanitize user input before filesystem operations

### Git Workflow
- Trunk-based development with feature branches
- Commit messages: imperative mood ("Add X", "Fix Y")
- Squash merge feature branches
- No direct pushes to main

## Architecture Notes

- **IPC**: WebSocket on localhost:9876 between UI and agent
- **Auth**: JWT with 1h access + 7d refresh tokens
- **Database**: SQLite (MVP) — Supabase/PostgreSQL for production
- **State**: Zustand stores in UI, Map-based caches in agent
- **Logging**: Structured JSON logs with rotation in agent
- **Connection Proxy**: TCP bridge between relay and Minecraft server
- **Guest Proxy**: TCP bridge for guests connecting via invite codes
- **Session Lifecycle**: `session.start/stop/list` and `guest.join/leave` IPC commands
