import {describe,it,expect} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {durableLane,waitMilliseconds} from '../crawler/platforms/bettingexpert/request-pacing'
describe('BE persistent pacing',()=>{
 it('preserves response boundary across STOP and new instance',()=>{const dir=mkdtempSync(join(tmpdir(),'be-pacing-'));try{let now=100000;const path=join(dir,'lane.json');const a=durableLane(path,()=>now);a.started();now+=1200;a.completed();now+=8000;const restarted=durableLane(path,()=>now);expect(restarted.wait()).toBe(3000);now+=3000;expect(restarted.wait()).toBe(0)}finally{rmSync(dir,{recursive:true,force:true})}})
 it('conservatively waits after interrupted request and backwards clock',()=>{expect(waitMilliseconds({lastStartedAt:1000},10000)).toBe(17000);expect(waitMilliseconds({lastStartedAt:1000,lastCompletedAt:2200},2000)).toBe(11200)})
})
