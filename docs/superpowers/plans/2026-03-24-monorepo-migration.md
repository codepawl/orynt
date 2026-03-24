# Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the codepawl project into a Bun workspaces monorepo with `apps/web` (Next.js frontend) and `apps/api` (backend placeholder), recovering deleted config files in the process.

**Architecture:** Move the existing Next.js app into `apps/web/` with all its config files (recovered from git history). Create a root `package.json` with Bun workspaces pointing to `apps/*` and `packages/*`. Add `apps/api/` as a minimal Bun server placeholder and `packages/shared/` for future shared code.

**Tech Stack:** Bun workspaces, Next.js 16, TypeScript

---

## Background

Commit `0c38049` accidentally deleted all Next.js config files (next.config.js, package.json with deps, tailwind.config.js, tsconfig.json, postcss.config.js, vercel.json, eslint.config.mjs). These must be restored into `apps/web/`.

## Target Structure

```
codepawl/
├── package.json                 # Root: workspaces config only
├── bun.lock                     # Single lockfile at root
├── CLAUDE.md
├── README.md
├── .gitignore
├── apps/
│   ├── web/                     # Next.js frontend (moved from root)
│   │   ├── app/
│   │   ├── content/
│   │   ├── public/
│   │   ├── next.config.js       # Recovered
│   │   ├── package.json         # @codepawl/web, recovered deps
│   │   ├── tsconfig.json        # Recovered (Next.js version)
│   │   ├── tailwind.config.js   # Recovered
│   │   ├── postcss.config.js    # Recovered
│   │   ├── eslint.config.mjs    # Recovered
│   │   └── vercel.json          # Recovered
│   └── api/                     # Backend placeholder
│       ├── src/
│       │   └── index.ts
│       ├── package.json         # @codepawl/api
│       └── tsconfig.json
├── packages/
│   └── shared/                  # Shared types/utils placeholder
│       ├── src/
│       │   └── index.ts
│       ├── package.json         # @codepawl/shared
│       └── tsconfig.json
```

---

### Task 1: Create feature branch

**Files:** None

- [ ] **Step 1: Create and switch to feature branch from staging**

```bash
git checkout staging
git checkout -b feat/monorepo-structure
```

- [ ] **Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `feat/monorepo-structure`

---

### Task 2: Create monorepo directory structure and move existing app

**Files:**
- Create: `apps/web/` (directory)
- Create: `apps/api/` (directory)
- Create: `packages/shared/` (directory)
- Move: `app/` → `apps/web/app/`
- Move: `content/` → `apps/web/content/`
- Move: `public/` → `apps/web/public/`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/web apps/api/src packages/shared/src
```

- [ ] **Step 2: Move Next.js app directories into apps/web**

```bash
git mv app apps/web/app
git mv content apps/web/content
git mv public apps/web/public
```

- [ ] **Step 3: Remove root index.ts (Bun hello world placeholder)**

```bash
git rm index.ts
```

- [ ] **Step 4: Commit the move**

```bash
git add -A
git commit -m "refactor: move Next.js app into apps/web/ for monorepo structure"
```

---

### Task 3: Restore Next.js config files into apps/web

**Files:**
- Create: `apps/web/package.json` — recovered deps with name `@codepawl/web`
- Create: `apps/web/next.config.js` — recovered from git
- Create: `apps/web/tsconfig.json` — recovered Next.js tsconfig
- Create: `apps/web/tailwind.config.js` — recovered, update content paths
- Create: `apps/web/postcss.config.js` — recovered
- Create: `apps/web/eslint.config.mjs` — recovered
- Create: `apps/web/vercel.json` — recovered

- [ ] **Step 1: Create apps/web/package.json**

Use the recovered package.json from `git show 0c38049^:package.json` but change the name to `@codepawl/web` and add `"dependencies": { "@codepawl/shared": "workspace:*" }`.

- [ ] **Step 2: Create apps/web/next.config.js**

Exact content from `git show 0c38049^:next.config.js` — no changes needed.

- [ ] **Step 3: Create apps/web/tsconfig.json**

Exact content from `git show 0c38049^:tsconfig.json` — no changes needed.

- [ ] **Step 4: Create apps/web/tailwind.config.js**

Use recovered content. Content paths are relative (`./app/**`), which is correct since tailwind runs from `apps/web/`.

- [ ] **Step 5: Create remaining config files**

- `apps/web/postcss.config.js` — exact recovery
- `apps/web/eslint.config.mjs` — exact recovery
- `apps/web/vercel.json` — exact recovery

- [ ] **Step 6: Commit config restoration**

```bash
git add apps/web/
git commit -m "feat: restore Next.js config files in apps/web"
```

---

### Task 4: Set up root workspace package.json

**Files:**
- Modify: `package.json` (root)
- Modify: `tsconfig.json` (root — simplify to reference)

- [ ] **Step 1: Replace root package.json with workspace config**

```json
{
  "name": "codepawl",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "bun run --filter @codepawl/web dev",
    "build": "bun run --filter @codepawl/web build",
    "start": "bun run --filter @codepawl/web start",
    "dev:api": "bun run --filter @codepawl/api dev",
    "lint": "bun run --filter @codepawl/web lint"
  }
}
```

- [ ] **Step 2: Replace root tsconfig.json with minimal reference**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json tsconfig.json
git commit -m "feat: configure root Bun workspaces"
```

---

### Task 5: Create API backend placeholder

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/tsconfig.json`

- [ ] **Step 1: Create apps/api/package.json**

```json
{
  "name": "@codepawl/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "@codepawl/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 2: Create apps/api/src/index.ts**

```typescript
const server = Bun.serve({
  port: 3001,
  fetch(req) {
    return new Response("CodePawl API");
  },
});

console.log(`API server running at ${server.url}`);
```

- [ ] **Step 3: Create apps/api/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat: add API backend placeholder"
```

---

### Task 6: Create shared package placeholder

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tsconfig.json`

- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "@codepawl/shared",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "devDependencies": {
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create packages/shared/src/index.ts**

```typescript
export const APP_NAME = "CodePawl";
```

- [ ] **Step 3: Create packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package placeholder"
```

---

### Task 7: Install dependencies and verify build

- [ ] **Step 1: Delete old bun.lock and node_modules**

```bash
rm -f bun.lock
rm -rf node_modules
```

- [ ] **Step 2: Install from root**

```bash
bun install
```

- [ ] **Step 3: Verify the web app dev server starts**

```bash
cd apps/web && bun run dev
```

Expected: Next.js dev server starts on port 3000.

- [ ] **Step 4: Verify the web app builds**

```bash
cd apps/web && bun run build
```

Expected: Build succeeds.

- [ ] **Step 5: Verify API starts**

```bash
cd apps/api && bun run dev
```

Expected: "API server running at http://localhost:3001"

- [ ] **Step 6: Commit lockfile**

```bash
git add bun.lock
git commit -m "chore: regenerate bun.lock for workspaces"
```

---

### Task 8: Update .gitignore and CLAUDE.md

**Files:**
- Modify: `.gitignore` — ensure apps/*/node_modules, .next in subdirs
- Modify: `CLAUDE.md` — update for monorepo structure

- [ ] **Step 1: Update .gitignore**

Add entries for monorepo structure if not already covered:
```
apps/*/.next
apps/*/node_modules
packages/*/node_modules
```

- [ ] **Step 2: Update CLAUDE.md**

Update commands section to reflect monorepo workspace commands and new project structure.

- [ ] **Step 3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "docs: update gitignore and CLAUDE.md for monorepo"
```

---

### Task 9: Push and merge to staging

- [ ] **Step 1: Push feature branch**

```bash
git push -u origin feat/monorepo-structure
```

- [ ] **Step 2: Merge to staging**

```bash
git checkout staging
git merge feat/monorepo-structure
git push origin staging
```

- [ ] **Step 3: Delete feature branch**

```bash
git branch -d feat/monorepo-structure
git push origin --delete feat/monorepo-structure
```
