# Project Phoenix

Insider whale detection system for prediction markets (e.g., Polymarket).

## Architecture

- **apps/web**: Next.js 14 dashboard with Tailwind CSS + shadcn/ui
- **apps/api**: Fastify REST API with Prisma ORM
- **apps/worker**: BullMQ background workers
- **packages/shared**: Shared TypeScript types, constants, and utilities

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript (ESM)
- **Monorepo**: pnpm workspaces + Turborepo
- **Database**: PostgreSQL 16 + Prisma
- **Cache/Queues**: Redis + BullMQ
- **Frontend**: Next.js 14, Tailwind CSS, shadcn/ui
- **Backend**: Fastify
- **Testing**: Vitest

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose

### Setup

1. **Start infrastructure**:
   ```bash
   docker compose up -d
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

4. **Push database schema**:
   ```bash
   pnpm db:push
   ```

5. **Seed data** (optional):
   ```bash
   pnpm db:seed
   ```

6. **Start development servers**:
   ```bash
   pnpm dev
   ```

   Services will run on:
   - Web: http://localhost:3000
   - API: http://localhost:4000
   - Worker: http://localhost:4002 (background)

## Development

- `pnpm dev` - Start all services in development mode
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm test` - Run all tests
- `pnpm db:push` - Push Prisma schema to database
- `pnpm db:migrate` - Create a new migration

## Insider Risk Score (IRS)

The system computes a 0-100 risk score for each bet using pre-resolution features:

### Components (weighted)

1. **Stake Impact (30%)**: Size, pool fraction, probability delta
2. **Temporal/Event Proximity (25%)**: Time to resolution, event proximity
3. **Wallet/Cluster History (20%)**: New wallet flags, betting patterns
4. **Evasion/Urgency (15%)**: Gas priority, funding patterns
5. **Market Microstructure (10%)**: Order flow, liquidity targeting

### Risk Levels

- 0-19: Neutral
- 20-49: Watch
- 50-74: High Risk
- 75-100: Critical

## API Endpoints

- `GET /health` - Health check
- `GET /markets` - List markets with pagination
- `GET /wallets/:address` - Wallet profile and scores
- `GET /alerts` - High-risk bets (IRS >= 75)
- `POST /score/bet` - Compute IRS for a bet

## License

MIT

