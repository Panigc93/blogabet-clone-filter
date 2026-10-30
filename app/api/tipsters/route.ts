import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder } from '@/lib/query'
import { parseListParams } from '@/lib/parseFilters'
import { toCsv } from '@/lib/csv'
import { and, count } from 'drizzle-orm'

const PAGE_SIZE = 50
const EXPORT_MAX_ROWS = 1000

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const { filters, sort, dir, page } = parseListParams(params)

  const where = buildFilters(filters)
  const whereClause = where.length ? and(...where) : undefined

  if (params.format === 'csv') {
    // Same filters/sort as the listing; capped to EXPORT_MAX_ROWS rows.
    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(tipsters)
        .where(whereClause)
        .orderBy(...sortOrder(sort, dir))
        .limit(EXPORT_MAX_ROWS),
      db.select({ value: count() }).from(tipsters).where(whereClause),
    ])

    const notice = rows.length < total
      ? `# AVISO: exportacion limitada a las primeras ${rows.length} filas de ${total} (refina los filtros para exportar menos de ${EXPORT_MAX_ROWS})\r\n`
      : ''
    const csv = notice + toCsv(rows)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tipsters-${rows.length}-de-${total}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const rows = await db
    .select()
    .from(tipsters)
    .where(whereClause)
    .orderBy(...sortOrder(sort, dir))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)

  return NextResponse.json({ data: rows, page, hasMore: rows.length === PAGE_SIZE })
}
