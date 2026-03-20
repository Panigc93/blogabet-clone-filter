# Tipsters Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a password-protected Next.js app that crawls blogabet's tipster API into a Neon PostgreSQL database and serves a fast, filterable tipsters listing page.

**Architecture:** Next.js 14 App Router for frontend + API routes; Drizzle ORM against Neon PostgreSQL; a standalone TypeScript crawler script runs in GitHub Actions (daily cron + manual full crawl). Auth via httpOnly cookie checked in middleware.

**Tech Stack:** Next.js 14, TypeScript, Drizzle ORM, `@neondatabase/serverless`, Bootstrap 3 (CDN), Font Awesome 4.7 (CDN), Bootstrap-Select 1.13 (CDN), Vitest, GitHub Actions

---

## File Map

| File | Responsibility |
|---|---|
| `db/schema.ts` | Drizzle table definition for `tipsters` |
| `db/index.ts` | Neon connection — exports `db` (pooled) and `dbDirect` (direct) |
| `lib/auth.ts` | HMAC cookie helpers: `signCookie(password)`, `verifyCookie(value)` |
| `lib/query.ts` | Builds Drizzle query from filter params; returns typed rows |
| `crawler/crawl.ts` | Standalone script: fetches blogabet API, upserts into DB |
| `middleware.ts` | Checks auth cookie; redirects unauthenticated requests to `/login` |
| `app/login/page.tsx` | Login form (server component + server action) |
| `app/page.tsx` | Tipsters listing (server component; initial 50 rows SSR) |
| `app/api/tipsters/route.ts` | GET handler — runs `lib/query.ts`, returns JSON (used by load-more) |
| `components/FilterBar.tsx` | Client component — all filter controls, emits URL param changes |
| `components/TipsterRow.tsx` | Pure presentational — renders one tipster row |
| `components/LoadMore.tsx` | "Ver más" button — fetches next page via `/api/tipsters` |
| `.github/workflows/crawl-daily.yml` | Cron job at 03:00 UTC, `f[lastActive]=1` |
| `.github/workflows/crawl-full.yml` | Manual dispatch, `f[lastActive]=12` |
| `vitest.config.ts` | Vitest config |
| `tests/lib/auth.test.ts` | Unit tests for HMAC helpers |
| `tests/lib/query.test.ts` | Unit tests for filter query builder |
| `tests/crawler/transform.test.ts` | Unit tests for API field mapping |

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`
- Create: `.env.local` (gitignored)

- [ ] **Step 1: Init Next.js project**

```bash
cd /home/cgarciap/Escritorio/blogabet-clone-filter
npx create-next-app@14 . --typescript --app --no-src-dir --no-tailwind --eslint --import-alias "@/*"
```

Expected: project scaffolded with `app/`, `public/`, `tsconfig.json`, `package.json`.

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit vitest @vitejs/plugin-react vite-tsconfig-paths
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `.env.local`**

```bash
cat > .env.local << 'EOF'
DATABASE_URL=your_neon_pooled_connection_string
DATABASE_URL_DIRECT=your_neon_direct_connection_string
SITE_PASSWORD=your_chosen_password
AUTH_SECRET=a_random_32char_string
BLOGABET_COOKIE=your_blogabet_session_cookie
EOF
```

Add `.env.local` to `.gitignore` if not already there.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 14 project with Drizzle and Vitest"
```

---

## Task 2: Database Schema

**Files:**
- Create: `db/schema.ts`
- Create: `db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Write schema**

Create `db/schema.ts`:
```ts
import { pgTable, integer, text, boolean, numeric, smallint, timestamptz, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const tipsters = pgTable('tipsters', {
  id:          integer('id').primaryKey(),
  slug:        text('slug').notNull().unique(),
  name:        text('name').notNull(),
  avatarUrl:   text('avatar_url'),
  flagUrl:     text('flag_url'),
  countryCode: text('country_code'),
  isPaid:      boolean('is_paid').notNull().default(false),
  price:       numeric('price', { precision: 8, scale: 2 }),
  sinceYear:   smallint('since_year'),
  picks:       integer('picks').notNull().default(0),
  profit:      numeric('profit', { precision: 10, scale: 2 }),
  yield:       numeric('yield', { precision: 6, scale: 2 }),
  verifiedPct: numeric('verified_pct', { precision: 5, scale: 2 }),
  followers:   integer('followers').notNull().default(0),
  lastPickAt:  timestamptz('last_pick_at'),
  resetCount:  smallint('reset_count').notNull().default(0),
  updatedAt:   timestamptz('updated_at').notNull().default(sql`NOW()`),
}, (t) => ({
  yieldIdx:      index('idx_tipsters_yield').on(t.yield),
  profitIdx:     index('idx_tipsters_profit').on(t.profit),
  picksIdx:      index('idx_tipsters_picks').on(t.picks),
  followersIdx:  index('idx_tipsters_followers').on(t.followers),
  sinceYearIdx:  index('idx_tipsters_since_year').on(t.sinceYear),
  lastPickIdx:   index('idx_tipsters_last_pick_at').on(t.lastPickAt),
  isPaidIdx:     index('idx_tipsters_is_paid').on(t.isPaid),
}))

export type Tipster = typeof tipsters.$inferSelect
export type TipsterInsert = typeof tipsters.$inferInsert
```

- [ ] **Step 2: Write DB connection**

Create `db/index.ts`:
```ts
import { neon } from '@neondatabase/serverless'
import { neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

// Pooled HTTP connection — for Next.js serverless functions
const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })

// Direct connection — for crawler (long-lived Node process)
// Used by crawler/crawl.ts via DATABASE_URL_DIRECT
```

- [ ] **Step 3: Configure Drizzle Kit**

Create `drizzle.config.ts`:
```ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
} satisfies Config
```

- [ ] **Step 4: Generate and apply migration**

```bash
npx drizzle-kit generate
DATABASE_URL_DIRECT="your_neon_direct_url" npx drizzle-kit migrate
```

Expected: `drizzle/` folder created, migration applied. Verify in Neon console: table `tipsters` exists.

- [ ] **Step 5: Commit**

```bash
git add db/ drizzle/ drizzle.config.ts
git commit -m "feat: add tipsters schema and Drizzle config"
```

---

## Task 3: Auth Helpers

**Files:**
- Create: `lib/auth.ts`
- Create: `tests/lib/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { signCookie, verifyCookie } from '@/lib/auth'

describe('auth cookie helpers', () => {
  const password = 'testpassword'
  const secret = 'aaaabbbbccccddddeeeeffffgggghhhh'

  it('signCookie returns a non-empty string', () => {
    const token = signCookie(password, secret)
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('verifyCookie returns true for a valid token', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, password, secret)).toBe(true)
  })

  it('verifyCookie returns false for wrong password', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, 'wrongpassword', secret)).toBe(false)
  })

  it('verifyCookie returns false for wrong secret', () => {
    const token = signCookie(password, secret)
    expect(verifyCookie(token, password, 'wrongsecret'.padEnd(32, 'x'))).toBe(false)
  })

  it('verifyCookie returns false for empty string', () => {
    expect(verifyCookie('', password, secret)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/lib/auth.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/auth'"

- [ ] **Step 3: Implement auth helpers**

Create `lib/auth.ts`:
```ts
import { createHmac, timingSafeEqual } from 'crypto'

export function signCookie(password: string, secret: string): string {
  return createHmac('sha256', secret).update(password).digest('hex')
}

export function verifyCookie(token: string, password: string, secret: string): boolean {
  if (!token) return false
  const expected = signCookie(password, secret)
  try {
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/lib/auth.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts tests/lib/auth.test.ts
git commit -m "feat: add HMAC auth cookie helpers with tests"
```

---

## Task 4: Middleware + Login Page

**Files:**
- Create: `middleware.ts`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Write middleware**

Create `middleware.ts`:
```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyCookie } from '@/lib/auth'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value ?? ''
  const password = process.env.SITE_PASSWORD!
  const secret = process.env.AUTH_SECRET!

  if (!verifyCookie(token, password, secret)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/tipsters).*)'],
}
```

- [ ] **Step 2: Write login page**

Create `app/login/page.tsx`:
```tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signCookie, verifyCookie } from '@/lib/auth'

async function loginAction(formData: FormData) {
  'use server'
  const password = formData.get('password') as string
  const sitePassword = process.env.SITE_PASSWORD!
  const secret = process.env.AUTH_SECRET!

  if (password !== sitePassword) {
    redirect('/login?error=1')
  }

  const token = signCookie(sitePassword, secret)
  const cookieStore = await cookies()
  cookieStore.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  redirect('/')
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fira Sans, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 4, padding: '32px 40px', boxShadow: '0 2px 8px rgba(0,0,0,.1)', minWidth: 300 }}>
        <h2 style={{ color: '#82daca', fontWeight: 900, marginBottom: 20, fontSize: 22 }}>TIPSTERS</h2>
        {searchParams.error && (
          <p style={{ color: '#eb6379', marginBottom: 12, fontSize: 13 }}>Contraseña incorrecta.</p>
        )}
        <form action={loginAction}>
          <input
            name="password"
            type="password"
            placeholder="Contraseña"
            required
            style={{ width: '100%', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '8px 10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
          />
          <button
            type="submit"
            style={{ width: '100%', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '9px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Smoke test auth flow**

```bash
npm run dev
```

Open `http://localhost:3000` — should redirect to `/login`.
Enter wrong password — should show error.
Enter correct password (from `.env.local`) — should redirect to `/`.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/login/page.tsx
git commit -m "feat: add auth middleware and login page"
```

---

## Task 5: Filter Query Builder

**Files:**
- Create: `lib/query.ts`
- Create: `tests/lib/query.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/query.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildFilters } from '@/lib/query'
import { and, gte, lte, inArray, notInArray, isNotNull, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

describe('buildFilters', () => {
  it('returns empty array for default params', () => {
    const filters = buildFilters({})
    expect(filters).toHaveLength(0)
  })

  it('adds isPaid filter for tipo=free', () => {
    const filters = buildFilters({ tipo: 'free' })
    expect(filters).toHaveLength(1)
  })

  it('adds isPaid filter for tipo=paid', () => {
    const filters = buildFilters({ tipo: 'paid' })
    expect(filters).toHaveLength(1)
  })

  it('adds yield filter when minYield is set', () => {
    const filters = buildFilters({ minYield: 10 })
    expect(filters).toHaveLength(1)
  })

  it('adds picks filter when minPicks is set', () => {
    const filters = buildFilters({ minPicks: 50 })
    expect(filters).toHaveLength(1)
  })

  it('adds multiple filters together', () => {
    const filters = buildFilters({ tipo: 'free', minYield: 5, minPicks: 100 })
    expect(filters).toHaveLength(3)
  })

  it('adds excludeYears filter', () => {
    const filters = buildFilters({ excludeYears: [2024, 2025] })
    expect(filters).toHaveLength(1)
  })

  it('adds price range with isPaid=true when priceMin/priceMax set', () => {
    const filters = buildFilters({ priceMin: 5, priceMax: 20 })
    // enforces is_paid=true + price >=  + price <=
    expect(filters).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/lib/query.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/query'"

- [ ] **Step 3: Implement query builder**

Create `lib/query.ts`:
```ts
import { and, eq, gte, lte, notInArray, SQL, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

export interface TipsterFilters {
  tipo?: 'all' | 'free' | 'paid'
  minYield?: number
  minPicks?: number
  activityMonths?: number  // 1 | 3 | 6 | 12
  excludeYears?: number[]
  priceMin?: number
  priceMax?: number
}

export type SortField = 'yield' | 'profit' | 'picks' | 'followers' | 'since_year' | 'price'

export function buildFilters(params: TipsterFilters): SQL[] {
  const conditions: SQL[] = []

  if (params.tipo === 'free') {
    conditions.push(eq(tipsters.isPaid, false))
  } else if (params.tipo === 'paid') {
    conditions.push(eq(tipsters.isPaid, true))
  }

  if (params.minYield !== undefined) {
    conditions.push(gte(tipsters.yield, String(params.minYield)))
  }

  if (params.minPicks !== undefined) {
    conditions.push(gte(tipsters.picks, params.minPicks))
  }

  if (params.activityMonths !== undefined) {
    conditions.push(
      gte(tipsters.lastPickAt, sql`NOW() - make_interval(months => ${params.activityMonths})`)
    )
  }

  if (params.excludeYears && params.excludeYears.length > 0) {
    conditions.push(notInArray(tipsters.sinceYear, params.excludeYears))
  }

  if (params.priceMin !== undefined || params.priceMax !== undefined) {
    // always enforce is_paid=true when price filter is active
    conditions.push(eq(tipsters.isPaid, true))
    if (params.priceMin !== undefined) {
      conditions.push(gte(tipsters.price, String(params.priceMin)))
    }
    if (params.priceMax !== undefined) {
      conditions.push(lte(tipsters.price, String(params.priceMax)))
    }
  }

  return conditions
}

export function sortColumn(sort: SortField) {
  switch (sort) {
    case 'profit':    return tipsters.profit
    case 'picks':     return tipsters.picks
    case 'followers': return tipsters.followers
    case 'since_year':return tipsters.sinceYear
    case 'price':     return tipsters.price
    default:          return tipsters.yield
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test tests/lib/query.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/query.ts tests/lib/query.test.ts
git commit -m "feat: add filter query builder with tests"
```

---

## Task 6: API Route

**Files:**
- Create: `app/api/tipsters/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/tipsters/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortColumn, TipsterFilters, SortField } from '@/lib/query'
import { and, desc } from 'drizzle-orm'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams

  const filters: TipsterFilters = {
    tipo:           (p.get('tipo') as TipsterFilters['tipo']) ?? 'all',
    minYield:       p.has('minYield')  ? Number(p.get('minYield'))  : undefined,
    minPicks:       p.has('minPicks')  ? Number(p.get('minPicks'))  : undefined,
    activityMonths: p.has('activity')  ? Number(p.get('activity'))  : undefined,
    excludeYears:   p.has('excludeYears')
      ? p.get('excludeYears')!.split(',').map(Number)
      : undefined,
    priceMin:       p.has('priceMin')  ? Number(p.get('priceMin'))  : undefined,
    priceMax:       p.has('priceMax')  ? Number(p.get('priceMax'))  : undefined,
  }

  const sort = (p.get('sort') as SortField) ?? 'yield'
  const page = Number(p.get('page') ?? 0)

  const where = buildFilters(filters)

  const rows = await db
    .select()
    .from(tipsters)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sortColumn(sort)))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)

  return NextResponse.json({ data: rows, page, hasMore: rows.length === PAGE_SIZE })
}
```

- [ ] **Step 2: Smoke test**

```bash
npm run dev
```

Open: `http://localhost:3000/api/tipsters?sort=yield`

Expected: JSON response `{ data: [], page: 0, hasMore: false }` (DB is empty at this point — will populate after crawler task).

- [ ] **Step 3: Commit**

```bash
git add app/api/tipsters/route.ts
git commit -m "feat: add /api/tipsters GET route with filters and pagination"
```

---

## Task 7: Crawler

**Files:**
- Create: `crawler/crawl.ts`
- Create: `tests/crawler/transform.test.ts`

- [ ] **Step 1: Write failing transform tests**

Create `tests/crawler/transform.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { transformTipster } from '@/crawler/crawl'

const mockApiTipster = {
  id: 12345,
  name: 'Test Tipster',
  slug: 'test-tipster',
  avatar: 'https://cdn.blogabet.com/avatars/abc.jpg',
  country: { flag: 'https://cdn.blogabet.com/images/flag/spain.png', code: 'ES' },
  subscription: { price: 9.99 },
  memberSince: '2022-05-15T00:00:00Z',
  picks: 500,
  profit: 1234.56,
  yield: 24.5,
  verifiedPercent: 87,
  followers: 120,
  lastPickDate: '2026-03-15T10:00:00Z',
  resetCount: 2,
}

describe('transformTipster', () => {
  it('maps all fields correctly', () => {
    const result = transformTipster(mockApiTipster)
    expect(result.id).toBe(12345)
    expect(result.slug).toBe('test-tipster')
    expect(result.name).toBe('Test Tipster')
    expect(result.avatarUrl).toBe('https://cdn.blogabet.com/avatars/abc.jpg')
    expect(result.countryCode).toBe('ES')
    expect(result.price).toBe('9.99')
    expect(result.isPaid).toBe(true)
    expect(result.sinceYear).toBe(2022)
    expect(result.picks).toBe(500)
    expect(result.verifiedPct).toBe('87')
    expect(result.followers).toBe(120)
    expect(result.resetCount).toBe(2)
  })

  it('sets isPaid=false and price=null when subscription.price is null', () => {
    const result = transformTipster({ ...mockApiTipster, subscription: { price: null } })
    expect(result.isPaid).toBe(false)
    expect(result.price).toBeNull()
  })

  it('sets isPaid=false when subscription.price is 0', () => {
    const result = transformTipster({ ...mockApiTipster, subscription: { price: 0 } })
    expect(result.isPaid).toBe(false)
  })

  it('parses sinceYear from ISO date string', () => {
    const result = transformTipster({ ...mockApiTipster, memberSince: '2019-01-01T00:00:00Z' })
    expect(result.sinceYear).toBe(2019)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test tests/crawler/transform.test.ts
```

Expected: FAIL — "Cannot find module '@/crawler/crawl'"

- [ ] **Step 3: Implement crawler**

Create `crawler/crawl.ts`:
```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters, TipsterInsert } from '../db/schema'
import { sql } from 'drizzle-orm'

// ─── Field transform ────────────────────────────────────────────────────────

export function transformTipster(raw: any): TipsterInsert {
  const price = raw.subscription?.price
  const isPaid = price !== null && price !== undefined && Number(price) > 0
  return {
    id:          raw.id,
    slug:        raw.slug,
    name:        raw.name,
    avatarUrl:   raw.avatar ?? null,
    flagUrl:     raw.country?.flag ?? null,
    countryCode: raw.country?.code ?? null,
    isPaid,
    price:       isPaid ? String(price) : null,
    sinceYear:   raw.memberSince ? new Date(raw.memberSince).getFullYear() : null,
    picks:       raw.picks ?? 0,
    profit:      raw.profit != null ? String(raw.profit) : null,
    yield:       raw.yield != null ? String(raw.yield) : null,
    verifiedPct: raw.verifiedPercent != null ? String(raw.verifiedPercent) : null,
    followers:   raw.followers ?? 0,
    lastPickAt:  raw.lastPickDate ? new Date(raw.lastPickDate) : null,
    resetCount:  raw.resetCount ?? 0,
    updatedAt:   new Date(),
  }
}

// ─── Fetch one page ──────────────────────────────────────────────────────────

async function fetchPage(lastActive: number, start: number, cookie: string): Promise<any[]> {
  const url = new URL('https://blogabet.com/tipsters/')
  url.searchParams.set('f[language]', 'all')
  url.searchParams.set('f[pickType]', 'all')
  url.searchParams.set('f[sport]', 'all')
  url.searchParams.set('f[leagues]', 'all')
  url.searchParams.set('f[picksOver]', '0')
  url.searchParams.set('f[lastActive]', String(lastActive))
  url.searchParams.set('f[bookiesUsed]', 'null')
  url.searchParams.set('f[order]', 'yield')
  url.searchParams.set('f[start]', String(start))

  const res = await fetch(url.toString(), {
    headers: { Cookie: cookie },
  })

  if (!res.ok) {
    throw new Error(`Blogabet API error: ${res.status} ${res.statusText}`)
  }

  const json = await res.json()
  return json.data ?? []
}

// ─── Main crawl loop ─────────────────────────────────────────────────────────

async function crawl() {
  const cookie = process.env.BLOGABET_COOKIE
  if (!cookie) throw new Error('BLOGABET_COOKIE is not set')

  const dbUrl = process.env.DATABASE_URL_DIRECT
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT is not set')

  const lastActive = Number(process.env.LAST_ACTIVE ?? '1')
  const db = drizzle(neon(dbUrl), { schema: { tipsters } })

  console.log(`Starting crawl: lastActive=${lastActive}`)
  let start = 0
  let total = 0

  while (true) {
    console.log(`Fetching page start=${start}`)
    const rows = await fetchPage(lastActive, start, cookie)

    if (rows.length === 0) {
      console.log('Empty page — crawl complete')
      break
    }

    const records = rows.map(transformTipster)

    await db
      .insert(tipsters)
      .values(records)
      .onConflictDoUpdate({
        target: tipsters.id,
        set: {
          slug:        sql`excluded.slug`,
          name:        sql`excluded.name`,
          avatarUrl:   sql`excluded.avatar_url`,
          flagUrl:     sql`excluded.flag_url`,
          countryCode: sql`excluded.country_code`,
          isPaid:      sql`excluded.is_paid`,
          price:       sql`excluded.price`,
          sinceYear:   sql`excluded.since_year`,
          picks:       sql`excluded.picks`,
          profit:      sql`excluded.profit`,
          yield:       sql`excluded.yield`,
          verifiedPct: sql`excluded.verified_pct`,
          followers:   sql`excluded.followers`,
          lastPickAt:  sql`excluded.last_pick_at`,
          resetCount:  sql`excluded.reset_count`,
          updatedAt:   sql`NOW()`,
        },
      })

    total += records.length
    console.log(`Upserted ${records.length} tipsters (total: ${total})`)
    start += 25

    // polite delay between pages
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`Crawl finished. Total upserted: ${total}`)
}

crawl().catch((err) => {
  console.error('Crawl failed:', err)
  process.exit(1)
})
```

- [ ] **Step 4: Run transform tests — verify they pass**

```bash
npm test tests/crawler/transform.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crawler/crawl.ts tests/crawler/transform.test.ts
git commit -m "feat: add blogabet crawler with field transform tests"
```

---

## Task 8: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/crawl-daily.yml`
- Create: `.github/workflows/crawl-full.yml`

- [ ] **Step 1: Write daily cron workflow**

Create `.github/workflows/crawl-daily.yml`:
```yaml
name: Crawl Daily (last month)

on:
  schedule:
    - cron: '0 3 * * *'   # 03:00 UTC daily
  workflow_dispatch:        # allow manual trigger

jobs:
  crawl:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run crawler
        env:
          DATABASE_URL_DIRECT: ${{ secrets.DATABASE_URL_DIRECT }}
          BLOGABET_COOKIE: ${{ secrets.BLOGABET_COOKIE }}
          LAST_ACTIVE: '1'
        run: npx tsx crawler/crawl.ts
```

- [ ] **Step 2: Write full crawl workflow (manual dispatch)**

Create `.github/workflows/crawl-full.yml`:
```yaml
name: Crawl Full (last 12 months)

on:
  workflow_dispatch:

jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run full crawler
        env:
          DATABASE_URL_DIRECT: ${{ secrets.DATABASE_URL_DIRECT }}
          BLOGABET_COOKIE: ${{ secrets.BLOGABET_COOKIE }}
          LAST_ACTIVE: '12'
        run: npx tsx crawler/crawl.ts
```

- [ ] **Step 3: Add `tsx` to devDependencies**

```bash
npm install -D tsx
```

- [ ] **Step 4: Commit**

```bash
git add .github/ package.json package-lock.json
git commit -m "feat: add GitHub Actions workflows for daily and full crawl"
```

---

## Task 9: TipsterRow Component

**Files:**
- Create: `components/TipsterRow.tsx`

- [ ] **Step 1: Write TipsterRow**

Create `components/TipsterRow.tsx`:
```tsx
import { Tipster } from '@/db/schema'

function StatCell({ value, label, colorClass }: { value: string; label: string; colorClass?: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <span className={`number ${colorClass ?? ''}`} style={{ display: 'block', fontSize: 22.5, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </span>
      <span style={{ display: 'block', fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: 2 }}>
        {label}
      </span>
    </div>
  )
}

function colorClass(value: string | null): string {
  if (!value) return ''
  const n = parseFloat(value)
  if (isNaN(n)) return ''
  if (n > 0) return 'text-success'
  if (n < 0) return 'text-danger'
  return ''
}

export function TipsterRow({ tipster }: { tipster: Tipster }) {
  const blogUrl = `https://${tipster.slug}.blogabet.com`
  const initials = tipster.name.slice(0, 2).toUpperCase()

  return (
    <a
      href={blogUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="tipster-block"
      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'stretch', background: '#fff', border: '1px solid #dbe1e8', borderRadius: 3, marginBottom: 6 }}
    >
      {/* LEFT: avatar + info */}
      <div className="tipster-left" style={{ borderLeft: '4px solid #82daca', display: 'flex', alignItems: 'center', padding: '10px 12px', minWidth: 240, maxWidth: 240 }}>
        <div style={{ flexShrink: 0, marginRight: 10 }}>
          {tipster.avatarUrl ? (
            <img src={tipster.avatarUrl} alt={tipster.name} className="img-circle" style={{ width: 60, height: 60, border: '2px solid #82daca', objectFit: 'cover' }} />
          ) : (
            <div className="img-circle" style={{ width: 60, height: 60, background: '#82daca', border: '2px solid #82daca', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 12 }}>
              {initials}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#333', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <strong>{tipster.name}</strong>
          </div>
          <span style={{ fontSize: 11, color: '#4dbfa2', display: 'block', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tipster.slug}.blogabet.com
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {/* Verified icon */}
            <span className="fa-stack" style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
              <i className={`fa fa-circle fa-stack-2x ${Number(tipster.verifiedPct) > 0 ? 'text-success' : ''}`} style={{ color: Number(tipster.verifiedPct) > 0 ? '#4dbfa2' : '#ccc' }}></i>
              <i className={`fa ${Number(tipster.verifiedPct) > 0 ? 'fa-check' : 'fa-times'} fa-stack-1x fa-inverse`}></i>
            </span>
            {/* Paid icon */}
            {tipster.isPaid && (
              <span className="fa-stack" style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
                <i className="fa fa-circle fa-stack-2x" style={{ color: '#4dbfa2' }}></i>
                <i className="fa fa-usd fa-stack-1x fa-inverse"></i>
              </span>
            )}
            {/* Reset icon */}
            {Number(tipster.resetCount) > 0 && (
              <span className="fa-stack" title={`Stats reseteadas ${tipster.resetCount} veces`} style={{ fontSize: 9, width: 18, lineHeight: '18px', height: 18 }}>
                <i className="fa fa-circle fa-stack-2x" style={{ color: '#ccc' }}></i>
                <i className="fa fa-refresh fa-stack-1x fa-inverse"></i>
              </span>
            )}
            {/* Flag */}
            {tipster.flagUrl && (
              <img src={tipster.flagUrl} alt={tipster.countryCode ?? ''} style={{ height: 14 }} />
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: stats */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 4px', borderLeft: '1px solid #eee' }}>
        <div className="pins" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', textAlign: 'center', width: '100%', padding: '8px 0' }}>
          <StatCell value={String(tipster.sinceYear ?? '—')} label="Since" />
          <StatCell value={String(tipster.picks)} label="Picks" />
          <StatCell value={tipster.profit != null ? (Number(tipster.profit) >= 0 ? `+${tipster.profit}` : String(tipster.profit)) : '—'} label="Profit" colorClass={colorClass(tipster.profit)} />
          <StatCell value={tipster.yield != null ? (Number(tipster.yield) >= 0 ? `+${tipster.yield}%` : `${tipster.yield}%`) : '—'} label="Yield" colorClass={colorClass(tipster.yield)} />
          <StatCell value={tipster.verifiedPct != null ? `${tipster.verifiedPct}%` : '0%'} label="Verified" colorClass={colorClass(tipster.verifiedPct)} />
          <StatCell value={String(tipster.followers)} label="Followers" />
        </div>
      </div>

      {/* RIGHT: actions */}
      <div style={{ background: '#fff', minWidth: 150, width: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 12px', gap: 6, borderLeft: '1px solid #eee' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#82daca', color: '#fff', border: '1px solid #4dbfa2', borderBottomWidth: 3, borderRadius: 4, padding: '7px 10px', width: '100%', fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', gap: 5, whiteSpace: 'nowrap' }}>
          <i className="fa fa-external-link"></i> VER EN BLOGABET
        </span>
        {tipster.isPaid && tipster.price && (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#333', textAlign: 'center', width: '100%', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {tipster.price}€ <small style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#999' }}>/ mes</small>
          </div>
        )}
      </div>
    </a>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/TipsterRow.tsx
git commit -m "feat: add TipsterRow component"
```

---

## Task 10: FilterBar + LoadMore Components

**Files:**
- Create: `components/FilterBar.tsx`
- Create: `components/LoadMore.tsx`

- [ ] **Step 1: Write FilterBar**

Create `components/FilterBar.tsx`:
```tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

const YEARS = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026]

export function FilterBar() {
  const router = useRouter()
  const sp = useSearchParams()

  const update = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(sp.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page') // reset pagination on filter change
    router.push(`/?${params.toString()}`)
  }, [router, sp])

  const tipo = sp.get('tipo') ?? 'all'
  const minYield = sp.get('minYield') ?? '0'
  const excludeYears = (sp.get('excludeYears') ?? '').split(',').filter(Boolean).map(Number)

  function toggleYear(year: number) {
    const next = excludeYears.includes(year)
      ? excludeYears.filter(y => y !== year)
      : [...excludeYears, year]
    update('excludeYears', next.length ? next.join(',') : null)
  }

  return (
    <div className="search-form" style={{ background: '#82daca', padding: '0 20px', borderBottom: '2px solid #4dbfa2' }}>
      <div id="page-content" style={{ maxWidth: 1020, margin: '0 auto' }}>
        <div className="row">
          <div className="col-xs-12">
            <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 900, letterSpacing: 1, margin: '14px 0 10px', textTransform: 'uppercase' }}>Tipsters</h1>
          </div>
        </div>
        <div className="row" style={{ paddingBottom: 10 }}>

          {/* TIPO */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Tipo</label>
            <div style={{ display: 'flex' }}>
              {(['all','free','paid'] as const).map((t, i) => (
                <div
                  key={t}
                  onClick={() => update('tipo', t)}
                  style={{
                    flex: 1, background: tipo === t ? '#4dbfa2' : '#fff',
                    color: tipo === t ? '#fff' : '#555',
                    border: '1px solid', borderColor: tipo === t ? '#3aaa8d' : '#ccc',
                    borderBottomWidth: 3, borderBottomColor: tipo === t ? '#2d937a' : '#ccc',
                    borderRight: i < 2 ? 'none' : undefined,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0,
                    fontSize: 13, fontWeight: 700, padding: '6px 4px',
                    cursor: 'pointer', textAlign: 'center'
                  }}
                >
                  {t === 'all' ? 'Todos' : t === 'free' ? 'Free' : 'Pago'}
                </div>
              ))}
            </div>
          </div>

          {/* YIELD */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Yield mínimo</label>
            <div style={{ background: '#fff', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '5px 10px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min="-100" max="500" value={minYield}
                  onChange={e => update('minYield', e.target.value)}
                  style={{ flex: 1, accentColor: '#4dbfa2', cursor: 'pointer' }} />
                <span style={{ color: '#333', fontSize: 13, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{minYield}%</span>
              </div>
            </div>
          </div>

          {/* PICKS */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Nº de picks</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
              value={sp.get('minPicks') ?? '0'}
              onChange={e => update('minPicks', e.target.value === '0' ? null : e.target.value)}>
              <option value="0">Todos</option>
              <option value="50">Más de 50</option>
              <option value="200">Más de 200</option>
              <option value="500">Más de 500</option>
              <option value="1000">Más de 1.000</option>
            </select>
          </div>

          {/* ACTIVIDAD */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Actividad</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
              value={sp.get('activity') ?? ''}
              onChange={e => update('activity', e.target.value || null)}>
              <option value="">Todos</option>
              <option value="1">Último mes</option>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
              <option value="12">Último año</option>
            </select>
          </div>

          {/* AÑO REGISTRO */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Año registro <small style={{ color: 'rgba(255,255,255,.65)', fontSize: 9 }}>(clic=excluir)</small>
            </label>
            <div style={{ background: '#fff', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '5px 7px', display: 'flex', flexWrap: 'wrap', gap: 3, minHeight: 34 }}>
              {YEARS.map(y => {
                const excluded = excludeYears.includes(y)
                return (
                  <span key={y} onClick={() => toggleYear(y)} style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                    background: excluded ? '#fde8e8' : '#e8f7f4',
                    color: excluded ? '#eb6379' : '#4dbfa2',
                    border: `1px solid ${excluded ? '#f0b8b8' : '#c8ece7'}`,
                    cursor: 'pointer', userSelect: 'none',
                    textDecoration: excluded ? 'line-through' : 'none',
                  }}>{y}</span>
                )
              })}
            </div>
          </div>

          {/* PRECIO/MES (solo pago) */}
          {tipo === 'paid' && (
            <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
              <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Precio/mes (€)</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="number" placeholder="Mín" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 9px', fontSize: 13, width: '100%' }}
                  value={sp.get('priceMin') ?? ''}
                  onChange={e => update('priceMin', e.target.value || null)} />
                <input type="number" placeholder="Máx" min={0} style={{ background: '#fff', color: '#333', border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, padding: '6px 9px', fontSize: 13, width: '100%' }}
                  value={sp.get('priceMax') ?? ''}
                  onChange={e => update('priceMax', e.target.value || null)} />
              </div>
            </div>
          )}

          {/* ORDENAR POR */}
          <div className="col-xs-12 col-md-6 col-lg-2" style={{ marginBottom: 10 }}>
            <label style={{ color: '#fff', fontSize: '80%', fontWeight: 400, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Ordenar por</label>
            <select className="form-control" style={{ border: '1px solid #ccc', borderBottomWidth: 3, borderRadius: 4, fontSize: 15 }}
              value={sp.get('sort') ?? 'yield'}
              onChange={e => update('sort', e.target.value)}>
              <option value="yield">Yield</option>
              <option value="profit">Profit</option>
              <option value="picks">Nº de picks</option>
              <option value="followers">Seguidores</option>
              <option value="since_year">Año de registro</option>
              <option value="price">Precio</option>
            </select>
          </div>

        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write LoadMore**

Create `components/LoadMore.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { Tipster } from '@/db/schema'
import { TipsterRow } from './TipsterRow'

export function LoadMore({ initialHasMore, searchString }: { initialHasMore: boolean; searchString: string }) {
  const [rows, setRows] = useState<Tipster[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    setLoading(true)
    const res = await fetch(`/api/tipsters?${searchString}&page=${page}`)
    const json = await res.json()
    setRows(prev => [...prev, ...json.data])
    setHasMore(json.hasMore)
    setPage(p => p + 1)
    setLoading(false)
  }

  return (
    <>
      {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
      {hasMore && (
        <div style={{ textAlign: 'center', padding: '14px 0 24px' }}>
          <button onClick={loadMore} disabled={loading}
            style={{ background: '#eb6379', color: '#fff', border: '1px solid #d44f65', borderBottomWidth: 3, borderRadius: 4, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', textTransform: 'uppercase' }}>
            {loading ? 'Cargando...' : 'Ver más'}
          </button>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/FilterBar.tsx components/LoadMore.tsx
git commit -m "feat: add FilterBar and LoadMore client components"
```

---

## Task 11: Main Page + Layout

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update layout with CDN links**

Edit `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tipsters',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" />
        <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;600;700;900&display=swap" rel="stylesheet" />
        <style>{`
          * { font-family: "Fira Sans", sans-serif; }
          body { background: #f0f0f0; font-size: 13px; color: #333; }
          .text-success { color: #4dbfa2 !important; }
          .text-danger  { color: #eb6379 !important; }
          a.tipster-block:hover { box-shadow: 0 2px 6px rgba(0,0,0,.1); }
        `}</style>
      </head>
      <body>
        {children}
        <script src="https://code.jquery.com/jquery-3.2.1.min.js" defer />
        <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js" defer />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Write main page**

Edit `app/page.tsx`:
```tsx
import { Suspense } from 'react'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortColumn, TipsterFilters, SortField } from '@/lib/query'
import { and, desc, count } from 'drizzle-orm'
import { FilterBar } from '@/components/FilterBar'
import { TipsterRow } from '@/components/TipsterRow'
import { LoadMore } from '@/components/LoadMore'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: {
    tipo?: string; minYield?: string; minPicks?: string; activity?: string
    excludeYears?: string; priceMin?: string; priceMax?: string; sort?: string
  }
}

export default async function Home({ searchParams }: PageProps) {
  const filters: TipsterFilters = {
    tipo:           (searchParams.tipo as TipsterFilters['tipo']) ?? 'all',
    minYield:       searchParams.minYield ? Number(searchParams.minYield) : undefined,
    minPicks:       searchParams.minPicks ? Number(searchParams.minPicks) : undefined,
    activityMonths: searchParams.activity ? Number(searchParams.activity) : undefined,
    excludeYears:   searchParams.excludeYears
      ? searchParams.excludeYears.split(',').map(Number)
      : undefined,
    priceMin:       searchParams.priceMin ? Number(searchParams.priceMin) : undefined,
    priceMax:       searchParams.priceMax ? Number(searchParams.priceMax) : undefined,
  }

  const sort = (searchParams.sort as SortField) ?? 'yield'
  const where = buildFilters(filters)
  const whereClause = where.length ? and(...where) : undefined

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(tipsters)
      .where(whereClause)
      .orderBy(desc(sortColumn(sort)))
      .limit(PAGE_SIZE),
    db.select({ value: count() }).from(tipsters).where(whereClause),
  ])

  const hasMore = rows.length === PAGE_SIZE
  const searchString = new URLSearchParams(searchParams as Record<string, string>).toString()

  return (
    <>
      <Suspense>
        <FilterBar />
      </Suspense>
      <div id="page-content" style={{ maxWidth: 1020, margin: '0 auto', padding: '0 12px' }}>
        <div style={{ padding: '8px 0 4px', fontSize: 13, color: '#777' }}>
          Mostrando <strong>{rows.length} de {total.toLocaleString('es')}</strong> tipsters
        </div>
        <div>
          {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
          <LoadMore initialHasMore={hasMore} searchString={searchString} />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Run dev and smoke test**

```bash
npm run dev
```

1. Open `http://localhost:3000` — login page (no data yet)
2. Login with password
3. See empty tipsters list (DB not yet populated)
4. Verify filters render correctly, changing them updates the URL

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: add main tipsters listing page with SSR and filter support"
```

---

## Task 12: Run Initial Crawl + End-to-End Smoke Test

**Files:** none (data population step)

- [ ] **Step 1: Run crawler locally against real Neon DB**

```bash
BLOGABET_COOKIE="your_cookie_here" \
DATABASE_URL_DIRECT="your_neon_direct_url" \
LAST_ACTIVE=12 \
npx tsx crawler/crawl.ts
```

Expected: console shows pages being fetched and upserted. Let it run to completion.

- [ ] **Step 2: Verify data in DB**

```bash
# Quick count check
DATABASE_URL_DIRECT="your_neon_direct_url" \
npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL_DIRECT!);
const r = await sql\`SELECT count(*) FROM tipsters\`;
console.log('Total tipsters:', r[0].count);
"
```

Expected: several thousand tipsters.

- [ ] **Step 3: Full end-to-end smoke test**

```bash
npm run dev
```

1. Login, land on tipsters page — should show rows with real data
2. Test each filter: tipo, yield slider, picks, actividad, año, orden
3. Test "Ver más" — loads next 50
4. Click a tipster — opens `https://<slug>.blogabet.com` in new tab
5. Toggle "Pago" — shows price filter, tipsters have prices

- [ ] **Step 4: Set up GitHub Actions secrets**

In the GitHub repo settings (`Settings → Secrets and variables → Actions`), add:
- `DATABASE_URL_DIRECT` — Neon direct connection string
- `BLOGABET_COOKIE` — session cookie

- [ ] **Step 5: Test daily workflow via manual dispatch**

In GitHub Actions UI, trigger `Crawl Daily (last month)` manually and verify it completes without error.

- [ ] **Step 6: Deploy to Vercel**

1. Push repo to GitHub (if not already)
2. Connect to Vercel: `npx vercel` or via vercel.com dashboard
3. Set env vars in Vercel dashboard: `DATABASE_URL` (pooled), `SITE_PASSWORD`, `AUTH_SECRET`
4. Deploy and verify the live URL works

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: project complete — crawler populated, deployed to Vercel"
```

---

## Run All Tests

```bash
npm test
```

Expected: 17 tests pass across auth, query builder, and crawler transform suites.
