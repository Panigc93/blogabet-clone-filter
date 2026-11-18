import {describe,it,expect} from 'vitest'
import {semanticBaselineRevision,publishedEstimateRoutesEnabled} from '@/lib/olbg-release-read-guard'
describe('private read-only release guards',()=>{
 it('ignores only unused crawler refresh metadata, not a new capture or audit',()=>{
  const row={id:1,platform:'blogabet',yield:'12',statsUpdatedAt:'2026-11-18T12:00:00Z',capturedAt:'2026-11-18T11:00:00Z',b2iAudit:null}
  const hash=semanticBaselineRevision([row])
  expect(semanticBaselineRevision([{...row,statsUpdatedAt:'2026-11-18T12:01:00Z'}])).toBe(hash)
  for(const field of ['id','platform','yield','capturedAt','b2iAudit','price','profit','avatarUrl','sinceYear','lastPickAt','isPaid','signupAt'])expect(semanticBaselineRevision([{...row,[field]:'changed'}])).not.toBe(hash)
 })
 it('pins SQL ordering, membership and all future unknown fields by default',()=>{
  const rows=[{id:1},{id:2}],hash=semanticBaselineRevision(rows)
  expect(semanticBaselineRevision([...rows].reverse())).not.toBe(hash)
  expect(semanticBaselineRevision(rows.slice(0,1))).not.toBe(hash)
  expect(semanticBaselineRevision([{id:1,futureField:3},{id:2}])).not.toBe(hash)
  expect(semanticBaselineRevision([{id:1,yield:'2'}])).toBe(semanticBaselineRevision([{yield:'2',id:1}]))
 })
 it('never enables production with LAB variables or enables labs with the release flag',()=>{
  expect(publishedEstimateRoutesEnabled({NODE_ENV:'production',LAB_PREVIEW:'1',OLBG_MONTHLY_LOCAL:'1'})).toBe(false)
  expect(publishedEstimateRoutesEnabled({NODE_ENV:'production',OLBG_PUBLISHED_ESTIMATES:'1'})).toBe(true)
  expect(publishedEstimateRoutesEnabled({NODE_ENV:'development',OLBG_PUBLISHED_ESTIMATES:'1'})).toBe(false)
  expect(publishedEstimateRoutesEnabled({NODE_ENV:'development',LAB_PREVIEW:'1',OLBG_MONTHLY_LOCAL:'1'})).toBe(true)
  expect(publishedEstimateRoutesEnabled({NODE_ENV:'production',OLBG_PUBLISHED_ESTIMATES:'true'})).toBe(false)
 })
})
