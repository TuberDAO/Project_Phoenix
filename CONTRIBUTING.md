# Contributing to Project Phoenix

Thank you for your interest in contributing to Project Phoenix! This document provides guidelines and standards for contributing to the project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Commit Messages](#commit-messages)
6. [Testing](#testing)
7. [Pull Requests](#pull-requests)
8. [Documentation](#documentation)

---

## Code of Conduct

- Be respectful and constructive
- Focus on the code, not the person
- Help others learn and grow
- Report any issues to maintainers

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker Desktop
- Git
- VS Code (recommended)

### Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/project-phoenix.git
cd project-phoenix

# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d

# Push DB schema
pnpm db:push

# Seed demo data
tsx scripts/seed-small.ts

# Start development
pnpm dev
```

### Recommended VS Code Extensions

- ESLint
- Prettier
- Prisma
- TypeScript and JavaScript Language Features

---

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes

Examples:
- `feature/add-wallet-clustering`
- `fix/score-computation-overflow`
- `docs/update-api-reference`

### Workflow

1. Create a branch from `main`
2. Make your changes
3. Write tests
4. Run linting and tests
5. Commit with conventional commits
6. Push and create PR
7. Address review comments
8. Merge after approval

---

## Coding Standards

### TypeScript

- **Strict mode**: Always use TypeScript strict mode
- **Explicit types**: Avoid `any`, use explicit types or `unknown`
- **Interfaces over types**: Prefer `interface` for object shapes
- **No unused variables**: Clean up all unused imports/variables

Example:
```typescript
// ✅ Good
interface UserData {
  id: string;
  name: string;
  email: string | null;
}

function getUser(id: string): Promise<UserData> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### Code Style

- **Indentation**: 2 spaces
- **Semicolons**: Required
- **Quotes**: Single quotes for strings
- **Line length**: Max 100 characters
- **Trailing commas**: Always in multiline objects/arrays

Example:
```typescript
const config = {
  name: 'phoenix',
  version: '1.0.0',
  features: [
    'scoring',
    'backtest',
    'export',
  ],
};
```

### File Organization

```
apps/api/src/
├── routes/          # API endpoints
├── services/        # Business logic
├── lib/             # Shared utilities
├── scoring/         # Scoring engine
├── features/        # Feature computation
├── backtest/        # Backtest runner
└── index.ts         # Entry point
```

### Naming Conventions

- **Files**: kebab-case (`insider-score.ts`)
- **Classes**: PascalCase (`class ScoreCalculator`)
- **Functions**: camelCase (`function computeScore()`)
- **Constants**: UPPER_SNAKE_CASE (`const MAX_RETRIES = 5`)
- **Types/Interfaces**: PascalCase (`interface PreResolutionFeatures`)

### Error Handling

Always handle errors gracefully:

```typescript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error: any) {
  logger.error('Operation failed:', error);
  throw new Error(`Operation failed: ${error.message}`);
}

// ❌ Bad
const result = await riskyOperation(); // No error handling
```

### Async/Await

- Always use `async`/`await` over `.then()`
- Handle Promise rejections

```typescript
// ✅ Good
async function fetchData() {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    logger.error('Fetch failed:', error);
    throw error;
  }
}

// ❌ Bad
function fetchData() {
  return fetch(url).then(r => r.json()); // Hard to debug
}
```

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature/fix)
- `test`: Adding or fixing tests
- `chore`: Build process, dependencies

### Examples

```
feat(scoring): add wallet clustering feature

Implement wallet clustering based on funding sources and
betting patterns. Adds `clusterId` to PreResolutionFeatures.

Closes #42
```

```
fix(api): handle undefined market category

Prevents 500 error when market category is null.

Fixes #123
```

```
docs(readme): update rate limit documentation

Clarify per-endpoint rate limits and retry behavior.
```

---

## Testing

### Test Requirements

- All new features must include tests
- Bug fixes must include regression tests
- Aim for 80%+ code coverage

### Running Tests

```bash
# All tests
pnpm test

# Specific suite
pnpm vitest src/scoring/insiderScore.test.ts

# Watch mode
pnpm vitest --watch

# Coverage
pnpm vitest --coverage
```

### Writing Tests

Use Vitest with descriptive test names:

```typescript
import { describe, it, expect } from 'vitest';
import { computeInsiderScore } from './insiderScore';

describe('Insider Score Computation', () => {
  it('should return IRS of 0 for minimal risk features', () => {
    const features = createMinimalRiskFeatures();
    const score = computeInsiderScore(features);
    expect(score.irsBet).toBeLessThan(20);
  });

  it('should return IRS >= 75 for high-risk features', () => {
    const features = createHighRiskFeatures();
    const score = computeInsiderScore(features);
    expect(score.irsBet).toBeGreaterThanOrEqual(75);
  });

  it('should apply weight presets correctly', () => {
    const features = createStandardFeatures();
    setCurrentWeights(STRICT_WEIGHTS);
    const score = computeInsiderScore(features);
    expect(score.components.temporal).toBeGreaterThan(0.25);
  });
});
```

### Test Data

- Use factories for test data
- Don't rely on production database
- Mock external API calls

```typescript
function createTestBet(overrides?: Partial<Bet>): Bet {
  return {
    id: 'test-bet-001',
    txHash: '0x123',
    marketId: 'test-market',
    wallet: '0xabc',
    betUsd: 1000,
    ...overrides,
  };
}
```

---

## Pull Requests

### PR Checklist

Before submitting:

- [ ] Code follows style guidelines
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] Lint errors fixed (`pnpm lint`)
- [ ] Builds successfully (`pnpm build`)
- [ ] Commit messages follow conventions
- [ ] PR description explains changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed
- [ ] Edge cases considered

## Related Issues
Closes #123
```

### Review Process

1. Automated checks must pass
2. At least one reviewer approval required
3. Address all comments
4. Squash commits if requested
5. Maintainer will merge

---

## Documentation

### Code Comments

- Use JSDoc for public APIs
- Explain "why", not "what"
- Keep comments up to date

```typescript
/**
 * Compute the Insider Risk Score from pre-resolution features.
 * 
 * @param features - 53-field feature vector
 * @returns IRS (0-100) with component breakdown
 * 
 * @example
 * const score = computeInsiderScore(features);
 * console.log(score.irsBet); // 82
 */
export function computeInsiderScore(
  features: PreResolutionFeatures
): InsiderRiskScore {
  // ...
}
```

### README Updates

When adding features:
1. Update `docs/README.md`
2. Update API endpoint list
3. Add examples
4. Update environment variables

### API Documentation

Document all new endpoints:

```typescript
/**
 * GET /wallets/:address/scores
 * 
 * Get IRS timeline for a wallet
 * 
 * Query params:
 * - from: ISO timestamp (optional)
 * - to: ISO timestamp (optional)
 * - limit: number (default: 100)
 * 
 * Returns:
 * {
 *   wallet: string;
 *   scores: Array<{ timestamp, irsBet, irsWallet, irsCluster }>;
 * }
 */
```

---

## Questions?

- Open an issue for bugs
- Start a discussion for feature ideas
- Tag maintainers for urgent issues

---

**Thank you for contributing to Project Phoenix!** 🚀

