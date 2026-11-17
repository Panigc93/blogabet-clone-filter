import {describe,it,expect} from 'vitest'
import {continuationAnchor} from '@/lib/period-pagination-anchor'
describe('period list continuation UTC anchor',()=>{
 it('preserves exact SSR instant on later pages within the same UTC month',()=>{
  const at='2026-11-30T23:59:00Z'
  expect(continuationAnchor(at,new Date('2026-11-30T23:59:59Z'))?.toISOString()).toBe(new Date(at).toISOString())
 })
 it('rejects continuation across month boundary rather than changing SQL order mid-list',()=>{
  expect(continuationAnchor('2026-11-30T23:59:00Z',new Date('2026-12-01T00:00:00Z'))).toBeNull()
  expect(continuationAnchor('invalid',new Date())).toBeNull()
  expect(continuationAnchor('2026-12-01T00:00:01Z',new Date('2026-12-01T00:00:00Z'))).toBeNull()
 })
})
