import { and, eq, gt, gte, inArray, isNull, lt, notInArray, or } from 'drizzle-orm'
import { tipsters } from '../db/schema'

// La tabla tipsters es multifuente (blogabet + tipstrr) y los slugs se
// repiten entre plataformas. TODO acceso del crawler Blogabet debe llevar
// este filtro: sin él, un borrado por slug con id distinto eliminaría filas
// Tipstrr, la cohorte de stats consultaría perfiles Tipstrr como si fueran
// BB y el borrado de stats inactivos limpiaría sus columnas.
export const blogabetOnly = eq(tipsters.platform, 'blogabet')

// crawl.ts: borra registros BB obsoletos (mismo slug, id distinto = reset de cuenta)
export const staleRecordWhere = (slugs: string[], ids: number[]) =>
  and(blogabetOnly, inArray(tipsters.slug, slugs), notInArray(tipsters.id, ids))

// stats.ts: cohorte de tipsters activos a los que refrescar stats (solo BB)
export const activeCohortWhere = (since: Date, minPicks: number) =>
  and(blogabetOnly, gte(tipsters.lastPickAt, since), ...(minPicks > 0 ? [gt(tipsters.picks, minPicks)] : []))

// stats.ts/cleanup.ts: filas BB inactivas cuyas stats se limpian (opt-in)
export const inactiveWhere = (since: Date) =>
  and(blogabetOnly, or(isNull(tipsters.lastPickAt), lt(tipsters.lastPickAt, since)))
