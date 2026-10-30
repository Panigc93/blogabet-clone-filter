import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder } from '@/lib/query'
import { parseListParams } from '@/lib/parseFilters'
import { and } from 'drizzle-orm'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const { filters, sort, page } = parseListParams(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  )

  const where = buildFilters(filters)

  const rows = await db
    .select()
    .from(tipsters)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...sortOrder(sort))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)

  return NextResponse.json({ data: rows, page, hasMore: rows.length === PAGE_SIZE })
}
