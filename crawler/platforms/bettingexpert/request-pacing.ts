/** Per-lane durable pacing. Transport must call completed before interpreting a
 * response or STOP, and use one lane only. No network is performed here. */
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs'
export interface LaneCheckpoint {lastStartedAt?:number;lastCompletedAt?:number}
export function waitMilliseconds(state:LaneCheckpoint,now:number){
  // An interrupted request with no receipt can have run for the full15s timeout.
  const boundary=state.lastCompletedAt!==undefined && (state.lastStartedAt===undefined||state.lastCompletedAt>=state.lastStartedAt)
    ? state.lastCompletedAt+11000 : state.lastStartedAt!==undefined ? state.lastStartedAt+15000+11000 : now
  return Math.max(0,boundary-now)
}
export function durableLane(path:string,clock=Date.now){
 const read=():LaneCheckpoint=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{}
 const save=(s:LaneCheckpoint)=>{writeFileSync(path+'.tmp',JSON.stringify(s),{mode:0o600});renameSync(path+'.tmp',path)}
 return{wait:()=>waitMilliseconds(read(),clock()),started:()=>save({...read(),lastStartedAt:clock()}),completed:()=>save({...read(),lastCompletedAt:clock()})}
}
