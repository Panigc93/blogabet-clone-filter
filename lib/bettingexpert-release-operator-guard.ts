export const BE_INSTALL_BASE='954b9188e0444888a3c42d0891ef2f3ebbb1a95a'
export const BE_RELEASE_SEMANTICS='be547-2026-11-v1'
export type BEOperatorContext={mode:string;head:string;remoteMaster:string;gitStatus:string;approvedHead?:string;approvedPublicationHead?:string;artifactVerified:boolean;releaseId:string}
export function assertBEOperatorContext(c:BEOperatorContext){
 if(!['plan','install','rollback'].includes(c.mode))throw Error('Unknown release mode')
 if(c.gitStatus!=='')throw Error('Working tree and index must be clean, including untracked files')
 if(!c.artifactVerified)throw Error('Approved release artifact mismatch')
 if(c.releaseId!==BE_RELEASE_SEMANTICS)throw Error('Unapproved release identity')
 if(c.mode!=='plan'&&(!/^[a-f0-9]{40}$/.test(c.approvedHead??'')||c.approvedHead!==c.head))throw Error('Exact separately approved local code HEAD required')
 if(c.mode==='rollback'){
  // Publication may have advanced master. Bind it to the separately approved
  // deployment commit, never silently accept arbitrary current master.
  if(!/^[a-f0-9]{40}$/.test(c.approvedPublicationHead??'')||![BE_INSTALL_BASE,c.approvedPublicationHead].includes(c.remoteMaster))throw Error('Rollback master is not the approved release publication')
 }else if(c.remoteMaster!==BE_INSTALL_BASE)throw Error('Remote master changed; review required')
}
