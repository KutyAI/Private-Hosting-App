# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions CI/CD pipeline with test, build, and security scan jobs
- React Error Boundary with graceful fallback UI
- Loading skeleton components for all major UI sections
- Unit test suite for auth module, rate limiter, and shared types
- Structured JSON logging with automatic rotation and cleanup
- Graceful shutdown handlers for all services (SIGTERM/SIGINT)
- `/health` and `/ready` endpoints with database connectivity check
- Multi-stage Dockerfiles for backend-api and relay-service
- Docker Compose configuration for production deployment
- Load testing scripts for API and relay services
- E2E smoke test script for full user journey validation
- Feature flags system with percentage-based rollout
- Crash reporter with opt-in diagnostics and local storage
- Performance benchmarking script for core operations
- Telemetry client for analytics and event tracking
- NAT traversal with STUN-based candidate gathering
- WebSocket relay server for fallback connections
- Access policy enforcement with whitelist/blacklist
- Backup scheduling with configurable intervals
- Server properties editor with live read/write
- Friend system with invite codes
- Rate limiting on all public API endpoints
- Auto-update checker with version comparison
- Comprehensive user documentation

### Changed
- Desktop UI migrated from react-scripts to Vite
- Crash recovery now uses exponential backoff (5s → 60s)
- Server listing now fetched via dedicated IPC command
- Dashboard now auto-refreshes metrics every 5 seconds

### Fixed
- Circular import bug in backend auth routes
- Archiver/extract-zip import compatibility issues
- TypeScript strict mode violations across all packages

## [0.1.0] - 2026-03-11

### Added
- Initial monorepo structure
- Backend API with Express + SQLite
- Host agent with WebSocket IPC
- Desktop UI shell with React + Tailwind
- Shared TypeScript types package
- Basic server lifecycle management
- Backup creation and restore
- JWT authentication
