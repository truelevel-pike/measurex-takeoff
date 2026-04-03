# MeasureX Takeoff — Infrastructure & Tests Audit
**Section:** A6 — Infrastructure + Tests  
**Date:** 2026-03-27  
**Auditor:** Admiral 5 / OpenClaw  
**Scope:** `next.config.ts`, `vercel.json`, `package.json`, `tsconfig.json`, `eslint.config.mjs`, `scripts/`, `tests/`, `jest.config.ts`, `vitest.config.ts`, `.env` handling, build config, CI/CD

---

## 1. `next.config.ts` — Build Configuration

### 1.1 Turbopack Declared But Production Build Forces Webpack
- **Severity:** HIGH
- **File:** `next.config.ts:16`, `package.json:8`
- **Issue:** `next.config.ts` declares `turbopack: {}` enabling Turbopack in dev (`next dev`), but the `build` script in `package.json` explicitly passes `--webpack` (`next build --webpack`). This means dev and production use **different bundlers**, which can silently introduce build-specific bugs that only manifest in production. The split creates a dangerous `dev-works-but-prod-fails` surface.
- **Fix:** Either remove `turbopack: {}` from `next.config.ts` and use `next dev --turbopack` in the `dev` script explicitly, or drop `--webpack` from the build script and commit to Turbopack for both. The current hybrid is unsupported and increases risk.

### 1.2 `analyze` Script Incompatible with Turbopack
- **Severity:** HIGH
- **File:** `package.json:19`, `next.config.ts:3-8`
- **Issue:** The `analyze` script (`ANALYZE=true next build`) does **not** pass `--webpack`, meaning it would run under Turbopack mode. `@next/bundle-analyzer` wraps the webpack config and has **no effect under Turbopack**. Bundle analysis would silently produce no output or an empty report.
- **Fix:** Change to `ANALYZE=true next build --webpack` or add a note that this only works in webpack mode.

### 1.3 `@next/bundle-analyzer` Version Mismatch
- **Severity:** MEDIUM
- **File:** `package.json:55`
- **Issue:** `next` is at `16.1.6` but `@next/bundle-analyzer` is pinned to `^15.5.13` (installed: `15.5.13`). Major version divergence — `@next/bundle-analyzer` must match the `next` major version to correctly instrument the webpack build graph.
- **Fix:** Update to `^16.x` when stable: `npm install @next/bundle-analyzer@^16.0.0 --save-dev`.

### 1.4 `NEXT_PUBLIC_APP_HOST` Missing `https://` Protocol Prefix
- **Severity:** HIGH
- **File:** `.env.local`, `next.config.ts:~52`
- **Issue:** `.env.local` sets `NEXT_PUBLIC_APP_HOST=measurex-takeoff.vercel.app` (no protocol). `next.config.ts` then constructs the CSP `connect-src` directive as `` wss://${host} `` — yielding the correct `wss://measurex-takeoff.vercel.app`. **However**, `.env.production.example` defines the value as `NEXT_PUBLIC_APP_HOST=https://your-app.vercel.app` (with `https://`), which would produce a broken `wss://https://your-app.vercel.app` — an invalid CSP directive that would block all SSE/WebSocket connections in production.
- **Fix:** Document clearly and enforce that `NEXT_PUBLIC_APP_HOST` must be a bare hostname (no protocol). Add a startup validation check or strip any protocol prefix in the config code. Update `.env.production.example` to reflect this.

### 1.5 Serwist PWA Config — Missing Runtime in `sw.ts`
- **Severity:** LOW
- **File:** `next.config.ts:9-12`
- **Issue:** Serwist is configured with `swSrc: "src/sw.ts"` and `swDest: "public/sw.js"`. `public/sw.js` exists (pre-built), but if the service worker is committed as a static file, it can become stale between deployments. No automated rebuild check exists in CI.
- **Fix:** Ensure `public/sw.js` is regenerated on every build. If it's committed, add a build step that fails if `public/sw.js` is out of date.

### 1.6 `HSTS` Applied to All Routes Including SSE and Dev
- **Severity:** LOW
- **File:** `next.config.ts:~82`
- **Issue:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` is applied via the global `/(.*)`  header. This is correct for production but will cause browser lockout issues if the app is ever served over HTTP (e.g., during local dev via HTTP). The `disable: process.env.NODE_ENV === "development"` on Serwist is good practice but HSTS doesn't have that guard.
- **Fix:** Conditionally apply HSTS only in production (`process.env.NODE_ENV === 'production'`).

---

## 2. `vercel.json` — Deployment Configuration

### 2.1 Wildcard CORS on All API Routes — Security Risk
- **Severity:** HIGH
- **File:** `vercel.json:30`
- **Issue:** `"Access-Control-Allow-Origin": "*"` is set globally for all `/api/(.*)` routes. This allows any web origin to make credentialed cross-origin requests to the API. While not a direct vulnerability if auth is enforced server-side, it enables CSRF-style abuse from any third-party site and violates least-privilege.
- **Fix:** Restrict ACAO to your known frontend origin (`https://measurex-takeoff.vercel.app`) or use dynamic origin validation in middleware.

### 2.2 `/api/ws` Function Duration Is Wasted — Serverless SSE Misconception
- **Severity:** HIGH  
- **File:** `vercel.json:9-11`
- **Issue:** `src/app/api/ws/route.ts` (which serves SSE) is listed with `maxDuration: 300`. Vercel Serverless Functions are **not persistent processes** — each invocation is one-shot. While Vercel does support streaming responses (which is what SSE uses), the `globalThis.__sseClients` Map used in `sse-broadcast.ts` is instance-local and **will not survive across function invocations** or route traffic to multiple instances. In a multi-instance deployment, one client may connect to Instance A and another to Instance B, and broadcasts from A will not reach B's clients.
- **Fix:** This is a fundamental architectural concern. For multi-instance deployments, SSE fan-out must use a persistent pub/sub channel (Redis, Supabase Realtime, Upstash). The current in-memory design only works in single-instance dev (one Node process). Add a comment or README warning at minimum; consider switching to Supabase Realtime for production SSE.

### 2.3 `vercel.json` `env` Block Only Has `NEXT_TELEMETRY_DISABLED`
- **Severity:** MEDIUM
- **File:** `vercel.json:44-46`
- **Issue:** The `env` block in `vercel.json` only sets `NEXT_TELEMETRY_DISABLED=1`. All real secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) must be set via Vercel Dashboard/CLI. There is no `env` schema or `envPreview`/`envDevelopment` configuration documented, increasing the risk that a new deploy target (preview branch, staging) could deploy with missing env vars.
- **Fix:** Add an `envVarsConfig` or README section listing all required env vars for deployment. Consider adding a build-time check that aborts if critical vars are absent.

### 2.4 Duplicate `ai-takeoff` Function Routes Listed
- **Severity:** LOW
- **File:** `vercel.json:12-18`
- **Issue:** Both `src/app/api/ai-takeoff/route.ts` and `src/app/api/projects/[id]/ai-takeoff/route.ts` are listed as separate functions with `maxDuration: 120`. The `src/app/api/ai-takeoff/route.ts` appears to be a legacy/standalone endpoint that may be superseded by the project-scoped one. If both are maintained, it's confusing; if one is deprecated, it should be removed.
- **Fix:** Audit whether both routes are needed. Remove the non-project-scoped one if it's dead code.

### 2.5 Only `iad1` Region — No Latency Consideration
- **Severity:** LOW
- **File:** `vercel.json:4`
- **Issue:** Deployment is locked to `iad1` (US East). If the user base is global or the Supabase project is in a different region, this could add unnecessary latency.
- **Fix:** Consider adding `auto` or multiple regions, or document the reasoning for `iad1`.

---

## 3. `package.json` — Dependencies & Scripts

### 3.1 `xlsx` 0.18.5 Has Multiple HIGH Severity CVEs
- **Severity:** CRITICAL
- **File:** `package.json` → `xlsx: ^0.18.5` (installed: 0.18.5)
- **Issues:**
  - `GHSA-4r6h-8v6p-xvw6` — Prototype Pollution in SheetJS (CVSS 7.8 HIGH) — `<0.19.3`
  - `GHSA-5pgg-2g8v-p4x9` — SheetJS ReDoS (CVSS 7.5 HIGH) — `<0.20.2`
- **Fix:** Upgrade to `xlsx@^0.20.2` or migrate to `exceljs` (actively maintained, no known CVEs). Note: `xlsx` 0.20.x moved to a Pro model; verify license acceptability. `exceljs` is a drop-in alternative for most use cases.

### 3.2 `next` 16.1.6 Has 5 Known CVEs — Patch Available
- **Severity:** HIGH
- **File:** `package.json` → `next: 16.1.6`
- **Issues (all fixed in 16.1.7):**
  - `GHSA-ggv3-7p47-pfv8` — HTTP request smuggling in rewrites (MODERATE)
  - `GHSA-3x4c-7xq6-9pq8` — Unbounded `next/image` disk cache growth / DoS (MODERATE)
  - `GHSA-h27x-g6w4-24gq` — Unbounded postponed resume buffering → DoS (MODERATE)
  - `GHSA-mq59-m269-xvcx` — null origin bypass of Server Actions CSRF checks (MODERATE)
  - `GHSA-jcc7-9wpm-mj36` — null origin bypass of dev HMR WebSocket CSRF (LOW)
- **Fix:** `npm install next@latest` → 16.1.7+.

### 3.3 `flatted` Vulnerable to Prototype Pollution and Unbounded Recursion DoS
- **Severity:** HIGH
- **File:** Transitive dependency (via webpack/jest tooling)
- **Issues:**
  - `GHSA-rf6f-7fwh-wjgh` — Prototype Pollution via `parse()` (HIGH)
  - `GHSA-25h7-pfq9-p65f` — Unbounded recursion DoS in `parse()` (CVSS 7.5 HIGH, `<3.4.0`)
- **Fix:** `npm audit fix` or force resolution in `package.json` `overrides`: `"flatted": ">=3.4.2"`.

### 3.4 `picomatch` Has ReDoS Vulnerability
- **Severity:** HIGH
- **File:** Transitive dependency
- **Issue:** `GHSA-c2c7-rcm5-vvqj` — ReDoS via extglob quantifiers (CVSS 7.5 HIGH, `<2.3.2` and `>=4.0.0 <4.0.4`)
- **Fix:** `npm audit fix` or add overrides: `"picomatch": ">=4.0.4"`.

### 3.5 `ts-jest` 29.x + Jest 30.x Version Mismatch
- **Severity:** HIGH
- **File:** `package.json` — `ts-jest: ^29.4.6`, `jest: ^30.3.0`
- **Issue:** `ts-jest` 29.x is only tested and officially compatible with Jest 27-29. Running `ts-jest@29.4.6` with `jest@30.3.0` is unsupported and may cause transform errors, incorrect type assertions, or silent misbehavior in TypeScript compilation. The `@types/jest` is `^30.0.0` which is correct for Jest 30, but `ts-jest` must also be upgraded.
- **Fix:** `npm install ts-jest@^30.0.0 --save-dev` (if a Jest 30 compatible release exists) or downgrade `jest` to `^29.x`. Check ts-jest release notes for Jest 30 support.

### 3.6 `DISABLE_RATE_LIMIT=true` in `.env.local` — Dangerously Permissive
- **Severity:** HIGH
- **File:** `.env.local`
- **Issue:** Rate limiting is disabled in the local dev environment. This is fine for local development, but if `.env.local` is accidentally deployed (e.g., via Docker or non-Vercel hosting), all rate limiting is silently bypassed. The setting is not documented as a dev-only flag in `.env.example`.
- **Fix:** Add a comment in `.env.local` marking this as dev-only. Add a runtime check in `rate-limit.ts` that logs a loud warning if `DISABLE_RATE_LIMIT=true` and `NODE_ENV=production`.

### 3.7 `OPENROUTER_API_KEY` in `.env.example` But Not Referenced in Code
- **Severity:** MEDIUM
- **File:** `.env.example`
- **Issue:** `OPENROUTER_API_KEY` appears in `.env.example` but no references exist in `src/`. This is either dead documentation (key was removed from code but not from example) or the feature that uses it was never wired up.
- **Fix:** Remove from `.env.example` if unused, or implement and document.

### 3.8 Multiple Env Vars Used in Code But Absent from `.env.example`
- **Severity:** MEDIUM
- **File:** `src/` (multiple files), `.env.example`
- **Missing from `.env.example`:**
  - `ADMIN_KEY` — used in admin route auth
  - `BING_IMAGE_SEARCH_ENDPOINT` — Bing image search feature
  - `BING_IMAGE_SEARCH_KEY` — Bing image search feature
  - `DISABLE_RATE_LIMIT` — rate limiting bypass flag
  - `FEATURE_FLAGS` — runtime feature flag JSON
  - `GEMINI_API_KEY` — Gemini AI model (different from `GOOGLE_API_KEY`)
  - `GOOGLE_CUSTOM_SEARCH_API_KEY` — Google CSE
  - `GOOGLE_CUSTOM_SEARCH_CX` — Google CSE context
  - `NEXT_PUBLIC_APP_URL` — public app URL (separate from `NEXT_PUBLIC_APP_HOST`)
  - `UNSPLASH_ACCESS_KEY` — image search feature
- **Fix:** Add all missing vars to `.env.example` with placeholder values and comments. Also document `VERCEL` (auto-set by Vercel) as read-only/auto.

### 3.9 `eslint` Lint Script Uses `--ext` Flag (Invalid in Flat Config Mode)
- **Severity:** MEDIUM
- **File:** `package.json:10`
- **Issue:** `"lint": "eslint . --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0"` — the `--ext` flag is **not supported in ESLint's flat config mode** (which `eslint.config.mjs` enables). ESLint 9+ with flat config ignores `--ext` silently or emits a deprecation warning. File extension filtering must be done via glob patterns in `eslint.config.mjs` instead.
- **Fix:** Remove `--ext .ts,.tsx` from the lint script. Ensure `eslint.config.mjs` explicitly includes `files: ['**/*.ts', '**/*.tsx']` in the config objects.

### 3.10 `test-auto-scale.mjs` Not Wired Into `package.json` Scripts
- **Severity:** LOW
- **File:** `test-auto-scale.mjs` (workspace root), `package.json`
- **Issue:** `test-auto-scale.mjs` exists at the project root but has no corresponding `package.json` script entry. It appears to be an ad-hoc test script that developers must know to run manually.
- **Fix:** Either add `"test:auto-scale": "node test-auto-scale.mjs"` to scripts, or move it to `scripts/` and document it.

### 3.11 No Engine Field — Node.js Version Not Pinned
- **Severity:** MEDIUM
- **File:** `package.json`
- **Issue:** There is no `"engines": { "node": ">=20.x" }` field. The project runs on Node 25.4.0 (current dev environment) but Next.js 16 requires Node ≥ 18.18.0. Without pinning, contributors or CI environments could use incompatible Node versions.
- **Fix:** Add `"engines": { "node": ">=20.0.0" }` to `package.json` and create a `.nvmrc` with the target version.

---

## 4. `tsconfig.json` — TypeScript Configuration

### 4.1 Missing `noUncheckedIndexedAccess` — Index Access Not Type-Safe
- **Severity:** MEDIUM
- **File:** `tsconfig.json`
- **Issue:** `strict: true` is set (good), but `noUncheckedIndexedAccess` is not enabled. Array and object index access returns the element type without `| undefined`, allowing silent runtime errors when accessing out-of-bounds indices or missing keys. Given the heavy use of polygon arrays, quantity maps, and classification lookups, this is a real bug risk.
- **Fix:** Add `"noUncheckedIndexedAccess": true` to `compilerOptions`. Expect some TS errors to fix — each one is a latent bug.

### 4.2 Missing `noImplicitOverride`
- **Severity:** LOW
- **File:** `tsconfig.json`
- **Issue:** `noImplicitOverride: true` enforces that subclass method overrides use the `override` keyword, preventing accidental overrides when base class methods are renamed or removed.
- **Fix:** Add `"noImplicitOverride": true` to `compilerOptions`.

### 4.3 `target: "ES2017"` Is Outdated
- **Severity:** LOW
- **File:** `tsconfig.json:4`
- **Issue:** `"target": "ES2017"` means the TypeScript compiler will downlevel async/await, optional chaining, etc. to older syntax. Since Next.js 16 targets modern browsers that support ES2022+ natively, this wastes bundle bytes and prevents use of newer features like `Array.at()`, `Object.hasOwn()`, etc.
- **Fix:** Update to `"target": "ES2022"` (aligns with Next.js defaults).

### 4.4 Scripts Directory Not Excluded from `tsconfig`
- **Severity:** LOW
- **File:** `tsconfig.json`
- **Issue:** `scripts/` is included in the TS compilation via `**/*.ts`. Scripts like `migrate.ts`, `load-test.ts`, and `e2e-api-test.ts` use `import.meta.dirname` and ESM-style code that assumes `tsx` at runtime, not tsc. They would fail to build under the app's tsconfig.
- **Fix:** Add `"scripts"` to the `exclude` array in `tsconfig.json`, or create a separate `tsconfig.scripts.json` for them.

---

## 5. `eslint.config.mjs` — Linting Configuration

### 5.1 Storybook a11y Rules Set to `"todo"` — Not Enforced
- **Severity:** MEDIUM
- **File:** `.storybook/preview.ts:16`
- **Issue:** `a11y: { test: 'todo' }` in the Storybook preview configuration sets accessibility tests to informational-only mode. Accessibility violations won't fail CI/CD. Given this is a construction takeoff tool likely used by professional contractors, accessibility matters.
- **Fix:** Change to `a11y: { test: 'error' }` to enforce accessibility rules, or document which specific rules are deferred and why.

### 5.2 No Custom ESLint Rules for `process.env` Access Patterns
- **Severity:** LOW
- **File:** `eslint.config.mjs`
- **Issue:** No ESLint rule enforces that `process.env` access is always done through a typed env helper module. Direct `process.env.FOO` accesses are scattered across the codebase, making it easy to add new env vars without documenting them.
- **Fix:** Consider using `@typescript-eslint/no-process-env` or a custom rule that forces env access through a single typed `src/lib/env.ts` module.

---

## 6. `jest.config.ts` — Test Configuration

### 6.1 No Coverage Thresholds Defined
- **Severity:** HIGH
- **File:** `jest.config.ts`
- **Issue:** `collectCoverageFrom` is defined (good), but there is no `coverageThreshold` configured. Running `npm run test -- --coverage` will report coverage but never fail the build due to low coverage. This means coverage can silently drop to 0% without any CI gate.
- **Fix:** Add a `coverageThreshold` block:
  ```ts
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  ```
  Adjust percentages based on current baseline.

### 6.2 `tests/api.integration.test.ts` Ignored — Duplicate Version Exists in `src/`
- **Severity:** MEDIUM
- **File:** `jest.config.ts:17`, `tests/api.integration.test.ts`, `src/__tests__/api.integration.test.ts`
- **Issue:** `jest.config.ts` explicitly ignores `tests/api.integration.test.ts` (the old live-server version). Meanwhile, `src/__tests__/api.integration.test.ts` is a newer, fully mocked version that does run. The old file in `tests/` makes fetch calls to a running dev server and is never executed in CI. It's stale dead code that confuses contributors about which is authoritative.
- **Fix:** Delete `tests/api.integration.test.ts` (the live-server version) or move it to `scripts/` and rename it clearly (e.g., `scripts/live-api-test.ts`). Remove the ignore entry from `jest.config.ts`.

### 6.3 `testEnvironment: 'jsdom'` Global — Node Tests Must Override Per-File
- **Severity:** MEDIUM
- **File:** `jest.config.ts:9`
- **Issue:** The global `testEnvironment` is `jsdom`, but several test files explicitly override this with `@jest-environment node` (e.g., `api.integration.test.ts`, `ai-takeoff.integration.test.ts`). This works, but it means Node-environment tests require a manual docblock comment. If someone forgets the docblock on a new Node API test, DOM globals will be present and may mask real bugs.
- **Fix:** Consider splitting test environments using `projects` in jest config, or document the `@jest-environment node` requirement for API tests prominently.

### 6.4 `transformIgnorePatterns` Allowlist May Be Incomplete
- **Severity:** MEDIUM
- **File:** `jest.config.ts:20-22`
- **Issue:** `transformIgnorePatterns` allows `kdbush`, `supercluster`, and `@turf` to be transformed (they're ESM). If other ESM packages are added as dependencies, tests can silently fail with `SyntaxError: Cannot use import statement in a module`. The current pattern `node_modules/(?!(kdbush|supercluster|@turf)/)` is fragile.
- **Fix:** Periodically audit dependencies for ESM-only packages. Consider using `jest-environment-node` with `"moduleType": "module"` or migrating to Vitest for all tests.

### 6.5 No Test Timeout Configuration
- **Severity:** LOW
- **File:** `jest.config.ts`
- **Issue:** There is no `testTimeout` configured. The default Jest timeout is 5000ms. The `draw-tool.integration.test.ts` test involves multiple `userEvent` interactions and `waitFor` calls that could legitimately take longer in slow CI environments, leading to flaky tests.
- **Fix:** Add `testTimeout: 15000` to `jest.config.ts`.

---

## 7. `vitest.config.ts` — Storybook Test Configuration

### 7.1 Vitest Config Has No Jest Tests — Parallel Test Runners Not Unified
- **Severity:** MEDIUM
- **File:** `vitest.config.ts`
- **Issue:** `vitest.config.ts` configures only the Storybook browser test project. There is no unified test command that runs both Jest (unit/integration tests) and Vitest (Storybook stories). The `test` script in `package.json` only calls `jest`, meaning Storybook interaction tests never run in CI.
- **Fix:** Add a `test:all` or `test:ci` script that runs `jest` and `vitest` sequentially (or in parallel): `"test:all": "jest && vitest run"`. Ensure CI runs `test:all`.

### 7.2 `@storybook/addon-vitest` Requires Playwright Browsers Not Guaranteed in CI
- **Severity:** MEDIUM
- **File:** `vitest.config.ts:27-28`
- **Issue:** Vitest browser tests run in a real Chromium instance via `@vitest/browser-playwright`. Playwright browsers must be installed separately (`npx playwright install chromium`). Without CI steps to install Playwright, `vitest run` will fail immediately. There is no CI configuration in the repo to check.
- **Fix:** Add `"test:storybook": "vitest run"` and document the Playwright install prerequisite in `README.md` and any CI config. Since there is no `.github/workflows/` directory (see §11), this is currently not being run in CI at all.

### 7.3 Vitest `extends: true` May Inherit Jest Config Options
- **Severity:** LOW
- **File:** `vitest.config.ts:19`
- **Issue:** `extends: true` in the Vitest project config inherits from the parent config object. Since the parent config is minimal (no `test.globals`, no `test.include`), this may behave unexpectedly if Vitest and Jest config objects are confused. Should be explicitly specified.
- **Fix:** Replace `extends: true` with explicit `plugins` and `test` configuration for the storybook project.

---

## 8. Tests — Coverage Gaps

### 8.1 Zero Tests for 38+ API Route Handlers
- **Severity:** HIGH
- **File:** `src/app/api/` (38 route files)
- **Issue:** The following API route categories have **no Jest tests** at any level:
  - `/api/admin/errors` — admin error log endpoint
  - `/api/agent/session` — agent session URL generation
  - `/api/audit-log` — audit logging
  - `/api/chat` + `/api/projects/[id]/chat` — AI chat
  - `/api/docs` — OpenAPI docs
  - `/api/errors` — error reporting
  - `/api/experiments` — experiment flags
  - `/api/feature-flags` + `/api/flags` — feature flag variants
  - `/api/health` — health check (simple but untested)
  - `/api/image-search` + `/api/vision-search` — image/vision search
  - `/api/metrics` + `/api/perf` + `/api/perf/summary` — metrics/perf telemetry
  - `/api/plugins` — plugin listing
  - `/api/projects/[id]/ai-takeoff/all-pages` — bulk AI takeoff
  - `/api/projects/[id]/ai-takeoff/apply` — AI apply
  - `/api/projects/[id]/assemblies` + `/[aid]` — assembly CRUD
  - `/api/projects/[id]/batch` — batch operations (used by AI takeoff, no direct test)
  - `/api/projects/[id]/duplicate` — project duplication
  - `/api/projects/[id]/estimates` — estimates
  - `/api/projects/[id]/export/contractor` + `/export/excel` — exports
  - `/api/projects/[id]/scale` + `/scale-preset` + `/scales` — scale management
  - `/api/projects/[id]/search-text` — text search
  - `/api/projects/[id]/share` — share tokens
  - `/api/projects/[id]/snapshot` + `/snapshots` — project snapshots
  - `/api/projects/[id]/webhooks` + `/webhooks/events` — webhook delivery
  - `/api/projects/compare` + `/recent` + `/restore` — project utilities
  - `/api/share/[token]` + `/share/[token]/export` — public share
- **Fix:** At minimum, add smoke tests for the highest-value routes: export, chat, batch, assemblies. The existing `ai-takeoff.integration.test.ts` pattern (mocked fetch + direct route invocation) is the right approach.

### 8.2 No Component Tests for Major UI Components
- **Severity:** HIGH
- **File:** `src/components/`
- **Issue:** Only `CanvasOverlay`, `DrawingTool`, and `LeftToolbar` are indirectly tested via `draw-tool.integration.test.ts`. Major components with zero test coverage include:
  - `QuantitiesPanel` — core output UI
  - `ScaleCalibration` / `ScaleCalibrationModal` — critical measurement accuracy
  - `ProjectSettingsPanel`
  - `AssemblyPanel` / `AssemblyEditor`
  - `ShareModal`
  - `PDFViewer` — partially tested via stress test only
  - `PageThumbnailSidebar` — partially tested via stress test
  - `AnnotationLayer`
- **Fix:** Add component tests for `QuantitiesPanel` and `ScaleCalibration` at minimum. The Storybook stories for `QuantitiesPanel` and `ProjectSettingsPanel` exist and could be promoted to interaction tests.

### 8.3 `store.test.ts` Missing Critical Store Operations
- **Severity:** MEDIUM
- **File:** `src/__tests__/store.test.ts`
- **Issue:** The store tests likely cover basic CRUD but (based on file structure review) do not test:
  - Undo/redo stack behavior
  - `hydrateState` with partial state
  - Scale update per-page (`scales: { [pageNumber]: ScaleCalibration }`)
  - Assembly quantity formula evaluation
  - Multi-page polygon filtering
- **Fix:** Extend `store.test.ts` to cover these cases.

### 8.4 2 Skipped Tests Found
- **Severity:** LOW
- **File:** `src/` (2 occurrences of `it.skip`/`test.skip`)
- **Issue:** Two tests are currently skipped. Skipped tests are invisible in CI pass/fail — they silently rot.
- **Fix:** Identify and either fix or remove the skipped tests. Add a lint rule or CI check that fails if `it.skip` is found in committed code.

### 8.5 `sheet-namer.test.ts` Tests Against Vague Assertions
- **Severity:** LOW
- **File:** `src/__tests__/sheet-namer.test.ts`
- **Issue:** Several tests only assert `expect(result).toBeTruthy()` without checking the specific returned value. For example, `it('handles elevation sheets')` passes as long as `extractSheetName` returns any non-null value — it wouldn't catch a regression that returns the wrong sheet name. The tests are documentation-style rather than regression-catching.
- **Fix:** Replace `toBeTruthy()` assertions with specific value checks: `expect(result).toBe('A3 EXTERIOR ELEVATIONS')` or similar.

---

## 9. `scripts/` — Developer Tools

### 9.1 `scripts/migrate.ts` Uses a Non-Existent `exec_sql` RPC as Primary Path
- **Severity:** HIGH
- **File:** `scripts/migrate.ts:57`
- **Issue:** The primary SQL execution path calls `supabase.rpc('exec_sql', { sql: stmt + ';' })`. This RPC function only exists if `000_bootstrap.sql` has been run to create it — and it's documented as a prerequisite. However, if the RPC fails, the code falls back to a manual `POST` to `/rest/v1/` with a `query` body, which is not a documented Supabase REST API endpoint. This fallback will always return an error (404 or 405). The `console.warn` and `continue` means **failed migrations silently succeed** from the script's perspective.
- **Fix:** Remove the broken fallback. Make the bootstrap prerequisite explicit with a clear error message. Consider using the official Supabase CLI (`supabase db push`) instead of a custom runner.

### 9.2 `scripts/run-migrations.ts` and `scripts/migrate.ts` Are Duplicate Runners
- **Severity:** MEDIUM
- **File:** `scripts/migrate.ts`, `scripts/run-migrations.ts`
- **Issue:** Two migration runner scripts exist with different implementations. `run-migrations.ts` is the `npm run migrate` target; `migrate.ts` is an alternative with `--dry-run` and `--from=` flags. The two are not synchronized — a bug fixed in one may not be in the other, and contributors are unclear which is authoritative.
- **Fix:** Consolidate into one script. Add the `--dry-run` and `--from=` flags to `run-migrations.ts` and remove `migrate.ts`, or vice versa.

### 9.3 `scripts/e2e-api-test.ts` Uses Top-Level `await` Without ESM Declaration
- **Severity:** MEDIUM
- **File:** `scripts/e2e-api-test.ts`
- **Issue:** The script uses top-level `await` (e.g., `await test(...)` at module scope) and `import.meta.dirname`, which requires ESM. However, the `package.json` at the project root does **not** declare `"type": "module"`. The script relies on `npx tsx` to handle this transparently, but this won't work if invoked via bare `node` or `ts-node`. The `node --experimental-strip-types` comment in the header suggests it was written for Node 22+ native TS support, but this is not the runtime being used (project runs on Node 25.4.0 where this is stable, but the run command in `package.json` is `npx tsx`).
- **Fix:** Document the required runtime clearly. Ensure the `package.json` script comment matches the actual invocation. Add `"type": "module"` to a `scripts/package.json` if needed.

### 9.4 `scripts/load-test.ts` Has No Rate-Limit Awareness
- **Severity:** MEDIUM
- **File:** `scripts/load-test.ts`
- **Issue:** The load test runs 10 concurrent workers each creating 20+ polygons (220+ total requests). The server has rate limiting enabled (unless `DISABLE_RATE_LIMIT=true`). Running the load test against a production or staging environment could trigger rate limits, causing false failures. There's no `--disable-rate-limit` flag or documentation about rate limit implications.
- **Fix:** Add a note in the script header and README that rate limiting must be disabled for accurate load test results. Add `--disable-rate-limit` awareness.

### 9.5 Shell Scripts Are Not Linted or Type-Safe
- **Severity:** LOW
- **File:** `scripts/*.sh` (6 shell scripts)
- **Issue:** Six shell scripts (`smoke-test.sh`, `agent-api-test.sh`, `agent-e2e-smoke.sh`, `agent-e2e-test.sh`, `e2e-test.sh`, `e2e-browser-use.sh`) exist with no shellcheck integration. Common issues like missing quoting, unhandled errors, and bash-vs-sh compatibility bugs are not caught.
- **Fix:** Add `shellcheck` to dev dependencies and a `lint:sh` script: `shellcheck scripts/*.sh`.

---

## 10. `.env` Handling — Security & Completeness

### 10.1 `.env.local` Missing `GEMINI_API_KEY` While Code Expects It
- **Severity:** HIGH
- **File:** `.env.local`, `src/app/api/ai-takeoff/route.ts` (and related)
- **Issue:** Code references `process.env.GEMINI_API_KEY` (separate from `GOOGLE_API_KEY`) for Gemini model calls. `.env.local` and `.env.example` do not include `GEMINI_API_KEY`. The `ai-takeoff.integration.test.ts` uses `GOOGLE_API_KEY` for the mock, but if the production code branches on `GEMINI_API_KEY` vs `GOOGLE_API_KEY`, this creates a configuration gap.
- **Fix:** Clarify whether `GOOGLE_API_KEY` and `GEMINI_API_KEY` are the same or different. Add whichever is needed to `.env.example`.

### 10.2 `.gitignore` Excludes All `.env*` Except `.env.example`
- **Severity:** INFO (correct behavior, but worth noting)
- **File:** `.gitignore`
- **Status:** The `.gitignore` correctly blocks `.env`, `.env.local`, `.env.production.local`, etc. and whitelists `.env.example`. This is correct. However, `.env.production.example` contains `DISABLE_RATE_LIMIT=false` as a reminder not to enable it in production — this is a good defensive pattern and should be maintained.

### 10.3 `NEXT_PUBLIC_APP_URL` vs `NEXT_PUBLIC_APP_HOST` — Two Similar Variables
- **Severity:** MEDIUM
- **File:** `src/` (multiple files), `.env.example`
- **Issue:** `NEXT_PUBLIC_APP_URL` (full URL with protocol, e.g., `https://app.measurex.io`) and `NEXT_PUBLIC_APP_HOST` (bare hostname for CSP, e.g., `app.measurex.io`) are both referenced in code but serve similar purposes with different formats. Neither is consistently documented. `NEXT_PUBLIC_APP_URL` is absent from `.env.example`.
- **Fix:** Consolidate to one variable or document both clearly with examples in `.env.example`. Add runtime validation at startup.

---

## 11. CI/CD — Missing Pipeline

### 11.1 No CI/CD Configuration at All
- **Severity:** CRITICAL
- **File:** (missing)
- **Issue:** There is **no `.github/workflows/` directory**, no `Dockerfile`, no `docker-compose.yml`, and no CI configuration of any kind in the repository. This means:
  - No automated test runs on pull requests
  - No lint checks on merge
  - No build verification before deploy
  - No vulnerability scanning
  - No coverage reporting
  - No Playwright browser install for Storybook tests
  - The only gating before deployment is Vercel's build step (`next build --webpack`)
- **Fix:** Create at minimum a GitHub Actions workflow (`.github/workflows/ci.yml`) that:
  1. Installs dependencies (`npm ci`)
  2. Runs lint (`npm run lint`)
  3. Runs type check (`npx tsc --noEmit`)
  4. Runs Jest tests (`npm test`)
  5. Installs Playwright and runs Vitest Storybook tests (`npx playwright install chromium && npx vitest run`)
  6. Runs `npm audit --audit-level=high`

### 11.2 No Dependabot or Automated Dependency Scanning
- **Severity:** HIGH
- **File:** (missing `.github/dependabot.yml`)
- **Issue:** With 7 known vulnerabilities (3 HIGH, 4 MODERATE) in current dependencies and no automated scanner, future vulnerabilities will accumulate undetected.
- **Fix:** Add `.github/dependabot.yml` with weekly npm dependency updates and security patches.

### 11.3 Vercel Deploy Happens Without Test Gate
- **Severity:** HIGH
- **File:** `vercel.json`
- **Issue:** Vercel is configured with `"buildCommand": "npm run build"` which only runs `next build --webpack`. It does not run tests, lint, or type-checking before deploying. Broken code that passes the build step can be deployed.
- **Fix:** Add `"buildCommand": "npm run lint && npx tsc --noEmit && npm test -- --passWithNoTests && npm run build"` to `vercel.json`, or use a CI system to block Vercel deploys on failed checks.

---

## 12. Migration Numbering Issues

### 12.1 Non-Sequential Migration Files — `006b` and `013b` Suffixes
- **Severity:** MEDIUM
- **File:** `supabase/migrations/`
- **Issue:** Migrations `006b_mx_formula_fields.sql` and `013b_mx_pages_text.sql` use an alphabetic suffix (`b`) instead of sequential numbering. This is an antipattern that:
  - Breaks sort order predictability (some tools sort `006b` after `007`)
  - Confuses the migration tracking table (`_migrations`)
  - Indicates a squash/insert was done rather than proper sequential migration
- **Fix:** Renumber to `006_1_...` or `006_005_...` depending on tooling, or accept the current state as permanent and document it.

### 12.2 Duplicate `010` and `012` Migration Semantic Overlap
- **Severity:** LOW
- **File:** `supabase/migrations/010_share_tokens.sql`, `supabase/migrations/012_share_token.sql`
- **Issue:** Migrations `010_share_tokens.sql` and `012_share_token.sql` appear to be related (both mention share tokens). This suggests migration `012` may have patched or corrected `010`, which can cause problems if migrations are replayed from scratch on a new database.
- **Fix:** Review both files to ensure they're idempotent when run in sequence on a fresh database. Add `IF NOT EXISTS` guards as needed.

---

## 13. Bundle Size & Performance

### 13.1 `pdfjs-dist@5.5.207` Is a Large Bundle Dependency
- **Severity:** MEDIUM
- **File:** `package.json`, `next.config.ts:22`
- **Issue:** `pdfjs-dist` is ~3.5MB unpacked. It's correctly marked as a `serverExternalPackage` to prevent bundling for server routes, and the worker is self-hosted. However, there's no dynamic import of the main `pdfjs-dist` library on the client side — it may be included in the main bundle or an early chunk.
- **Fix:** Verify that `pdfjs-dist` is dynamically imported in `PDFViewer` (and not statically imported at module level). Add a bundle size budget check to `next.config.ts` or CI.

### 13.2 No `next/image` Usage for Any Thumbnails
- **Severity:** LOW
- **File:** `src/components/`
- **Issue:** PDF page thumbnails (canvas-based) and any project preview images may not use `next/image`. Without `next/image`, there's no automatic WebP conversion, lazy loading, or size optimization for images served from the app.
- **Fix:** Audit image rendering across components and use `next/image` where applicable.

---

## Summary: Issue Counts by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH     | 16 |
| MEDIUM   | 14 |
| LOW      | 12 |
| **Total** | **45** |

### Top 5 Highest-Priority Fixes

1. **[CRITICAL] No CI/CD Pipeline** — Tests never run automatically; broken code ships.
2. **[CRITICAL] `xlsx` 0.18.5 with 2 HIGH CVEs** — Prototype pollution + ReDoS in export path.
3. **[CRITICAL] `next` 16.1.6 with 5 CVEs** — Patch to 16.1.7 is one command.
4. **[HIGH] SSE fan-out architecture broken at scale** — `globalThis` Map doesn't survive multiple Vercel instances; real-time collaboration silently fails in production.
5. **[HIGH] `ts-jest@29` + `jest@30` incompatibility** — Test runner may have silent failures or incorrect behavior.
