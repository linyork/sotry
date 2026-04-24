# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sotry** is an AI-driven interactive fiction engine. Users write "blocks" (modular story context) and chat with AI-controlled characters. A two-stage LLM pipeline (Director + Generator) handles multi-turn narrative with real-time streaming.

## Development Commands

### Local Development (Docker Compose)
```bash
docker-compose up
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
# Ollama: http://localhost:11434
# SQLite Web UI: http://localhost:8080
```

This starts all services (Ollama, backend, frontend, DB UI) in one command. Hot reload is enabled — saving any file will auto-restart the backend and re-apply migrations; the browser refresh is all that's needed.

### Without Docker (manual)
Requires a separately running Ollama instance. Run in two terminals:
```bash
cd backend && npm install && npm run dev   # port 3001
cd frontend && npm install && npm run dev  # port 5173
```

### Build
```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm run preview
```

### Database Seeding
```bash
node insert_blocks.js   # Fantasy/supernatural world (Traditional Chinese)
node insert_blocks2.js  # Modern Taiwan contemporary narrative
```

## Architecture

### Director-Generator Pattern

The core narrative engine in `backend/src/graph/` uses a two-stage LLM approach:

1. **Director** (`director.ts`): Decides *who speaks next* and *which blocks are relevant*. Also signals `wait_for_user` when the max consecutive AI turns limit is reached, preventing infinite AI loops.

2. **Generator** (`generator.ts`): Receives the chosen character + resolved blocks, then streams a response token-by-token via SSE.

3. **Resolver** (`resolver.ts`): Resolves multi-parent block relationships before injecting context into the generator.

### Block System

Blocks are the core abstraction for story context. Types and their semantics:
- `timespace` — world rules, always injected
- `location` — physical settings
- `character` — NPCs and protagonist (`is_player` flag marks the human character)
- `other` — lore, rules, systems
- `plot` — event catalysts (conditionally included)
- `response_style` — formatting instructions (`for_character` flag targets character-specific style)

Blocks support multi-parent linking via the `block_parents` junction table, enabling modular composition (e.g., a character block inheriting location + rule blocks).

### API Communication

Frontend proxies `/api/*` to the backend via Vite's dev proxy config. The `/api/chat` endpoint streams Server-Sent Events (SSE) with these event types:
- `user_saved` → user message persisted
- `director` → speaker selected + blocks resolved
- `token` → streamed text chunk
- `done` → full response saved to DB
- `director_done` → all director turns complete
- `wait_for_user` → AI turn limit reached, awaiting user input
- `error` → something failed

### Database

SQLite via `better-sqlite3` (synchronous). Schema lives in `backend/src/db/index.ts` with 8 auto-applied migrations tracked in `_schema_version`. Key tables: `blocks`, `block_parents`, `conversations`, `messages` (stores `sent_blocks` and `director_decisions` as JSON), `settings`.

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Express server entry, middleware, route mounting |
| `backend/src/graph/director.ts` | Character selection & block relevance logic |
| `backend/src/graph/generator.ts` | LLM streaming response generation |
| `backend/src/graph/resolver.ts` | Block dependency resolution |
| `backend/src/db/index.ts` | SQLite schema + all migrations |
| `frontend/src/components/Chat.tsx` | SSE consumption, streaming display |
| `frontend/src/components/Sidebar.tsx` | Block manager + conversation switcher |
| `frontend/src/api/index.ts` | All backend API calls |
| `frontend/vite.config.ts` | API proxy configuration |

## Settings

Configurable via `/api/settings` (persisted in SQLite):
- `director_model` — Ollama model for director decisions
- `generator_model` — Ollama model for response generation
- `max_consecutive_ai_turns` — prevents infinite AI dialogue loops
