import {describe,it,expect} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {PgDialect} from 'drizzle-orm/pg-core'
import {effectiveProfitUnit,profitSortWarning,sortOrder} from '@/lib/query'
import {parseBlocks} from '@/crawler/crawl'
import {fromDbTipster} from '@/components/tipster-card-model'
import {olbgReadContext} from '@/lib/olbg-read-context'
import {periodReadContext} from '@/lib/bet2invest-period-read'
import type {TipsterReadRow} from '@/components/tipster-card-model'
const dialect=new PgDialect()
describe('Blogabet Profit units: source to read, no amount conversion or DB update',()=>{
 it('parses Profit as units while keeping subscription price in EUR',()=>{
  const html=`<div class="tipster-block"><div class="avatar"><a href="https://demo.blogabet.com"></a></div><a onclick="tipsters.showFollowBox('17')"></a><h3 class="name-t"><strong>Demo</strong></h3><div class="pins">${['2015','9781','+7538','+19%','100%','18274'].map(n=>`<span class="number">${n}</span>`).join('')}</div><div class="subscribe-btns">55€ / MONTH</div></div>`
  const row=parseBlocks(html)[0]
  expect(row).toMatchObject({profit:'7538',profitUnit:'blogabet-units',price:'55',sinceYear:2015,picks:9781,yield:'19'})
  const card=fromDbTipster({...row,platform:'blogabet',priceCurrency:'eur',profitUnit:'eur'} as TipsterReadRow)
  expect(card.profitDisplay).toBe('+7538');expect(card.profitLabel).toBe('Profit (u.)')
  expect(card.priceLabel).toBe('55');expect(card.priceCurrencySuffix).toBe('€')
 })
 it('corrects legacy metadata before SQL grouping without changing stored numbers or other platforms',async()=>{
  const db=new PGlite()
  try{
   await db.exec(`CREATE TABLE tipsters(id int,platform text,profit_unit text,profit numeric);INSERT INTO tipsters VALUES(1,'blogabet','eur',7538),(2,'blogabet','blogabet-units',1232),(3,'tipstrr','units',361.815),(4,'bettingexpert','bettingexpert-points',952.24);`)
   const q=dialect.sqlToQuery(effectiveProfitUnit()), order=sortOrder('profit').map(v=>dialect.sqlToQuery(v).sql).join(',')
   const rows=await db.query<{id:number;unit:string}>(`SELECT id,${q.sql} AS unit FROM tipsters ORDER BY ${order}`,q.params)
   expect(rows.rows.map(r=>[r.id,r.unit])).toEqual([[4,'bettingexpert-points'],[1,'blogabet-units'],[2,'blogabet-units'],[3,'units']])
   expect((await db.query('SELECT profit_unit,profit::text FROM tipsters WHERE id=1')).rows).toEqual([{profit_unit:'eur',profit:'7538'}])
   const projection=olbgReadContext(periodReadContext([],new Date('2026-11-18T10:00:00Z')),false).projection
   expect(dialect.sqlToQuery(projection.profitUnit).sql).toContain('blogabet-units')
   expect(dialect.sqlToQuery(sortOrder('yield')[0]).sql).not.toContain('profit_unit')
  }finally{await db.close()}
 })
 it('warns about unit comparability without confusing subscription EUR',()=>{
  expect(profitSortWarning('profit',undefined)).toContain('u Blogabet')
  expect(profitSortWarning('profit',undefined)).not.toContain('€ Blogabet')
  expect(profitSortWarning('yield',undefined)).toBeNull()
 })
})
