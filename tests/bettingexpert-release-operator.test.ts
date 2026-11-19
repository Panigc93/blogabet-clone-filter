import {it,expect} from 'vitest'
import {assertBEOperatorContext,BE_INSTALL_BASE,type BEOperatorContext} from '@/lib/bettingexpert-release-operator-guard'
const head='7b1e88fd95c7d0c914266c30eb4944573b354a84',publication='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const base:BEOperatorContext={mode:'install',head,remoteMaster:BE_INSTALL_BASE,gitStatus:'',approvedHead:head,artifactVerified:true,releaseId:'be547-2026-11-v1'}
it('install requires exact clean approved code, fixed artifact and unchanged master',()=>{
 expect(()=>assertBEOperatorContext(base)).not.toThrow()
 for(const change of [{gitStatus:' M lib/query.ts'},{gitStatus:'M  lib/query.ts'},{gitStatus:'?? rogue.ts'},{approvedHead:publication},{artifactVerified:false},{releaseId:'other'},{remoteMaster:publication}])expect(()=>assertBEOperatorContext({...base,...change})).toThrow()
})
it('rollback accepts the approved postpublication master but never an arbitrary newer commit',()=>{
 const rollback={...base,mode:'rollback',remoteMaster:publication,approvedPublicationHead:publication}
 expect(()=>assertBEOperatorContext(rollback)).not.toThrow()
 expect(()=>assertBEOperatorContext({...rollback,remoteMaster:BE_INSTALL_BASE})).not.toThrow()
 for(const change of [{approvedPublicationHead:undefined},{remoteMaster:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'},{gitStatus:' M scripts/bettingexpert-fixed-release.ts'},{artifactVerified:false},{approvedHead:publication}])expect(()=>assertBEOperatorContext({...rollback,...change})).toThrow()
})
