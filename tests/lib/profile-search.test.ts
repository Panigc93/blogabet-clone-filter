import {describe,it,expect} from 'vitest'
import {profileSearch} from '@/lib/profile-search'
describe('pasted public profile URLs',()=>{
 it.each([
  ['https://sample.blogabet.com/', 'blogabet', 'sample'],
  ['tipstrr.com/tipster/the-least-expected/stats','tipstrr','the-least-expected'],
  ['https://golazobets.com/tipster/FutbolEnCasa','golazobets','FutbolEnCasa'],
  ['https://bet2invest.com/tipsters/performance-stats/Kasparov','bet2invest','Kasparov'],
  ['https://www.bettingexpert.com/user/profile/example','bettingexpert','example'],
  ['https://apuestes.com/tipster/P%C3%A9rez','apuestes','Pérez'],
  ['https://www.olbg.com/tipsters/about/123','olbg','123'],
 ])('%s identifies only its platform/profile',(url,platform,slug)=>expect(profileSearch(url)).toEqual({platform,slug}))
 it.each(['Kasparov','https://example.invalid/tipster/Kasparov','https://bet2invest.com.evil.invalid/tipsters/performance-stats/Kasparov','https://user:password@bet2invest.com/tipsters/performance-stats/Kasparov','https://apuestes.com/tipster/%ZZ'])('does not reinterpret ordinary text or unrecognized links: %s',q=>expect(profileSearch(q)).toBeNull())
})
