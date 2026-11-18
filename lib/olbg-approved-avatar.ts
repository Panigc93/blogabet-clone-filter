// Read only whitelisted scalar avatar fields, not incidental tagged dates.
export function approvedOlbgAvatar(node:unknown,id:number):string|null{
 const data=(node as {data?:unknown[]})?.data
 if(!Array.isArray(data)||data.length>20000)throw Error('Invalid avatar node')
 const root=data[0] as Record<string,unknown>
 if(!root||typeof root!=='object'||Array.isArray(root))throw Error('Invalid avatar root')
 const scalar=(ref:unknown)=>{if(!Number.isSafeInteger(ref)||Number(ref)<0||Number(ref)>=data.length)throw Error('Invalid avatar reference');return data[Number(ref)]}
 if(scalar(root.effectiveTipsterId)!==id)throw Error('Avatar identity mismatch')
 const avatar=scalar(root.avatarApproved)
 if(avatar===null||avatar===false)return null
 if(typeof avatar!=='object'||Array.isArray(avatar))throw Error('Invalid approved avatar')
 const a=avatar as Record<string,unknown>
 if(scalar(a.tipster_id)!==id)throw Error('Avatar owner mismatch')
 if(scalar(a.approved)!==1||scalar(a.deleted_by_user)!==0)return null
 const url=scalar(a.avatar_url)
 if(typeof url!=='string')throw Error('Invalid avatar URL')
 const resolved=new URL(url,'https://www.olbg.com').href
 validateOlbgAvatarUrl(resolved)
 return resolved
}
export function validateOlbgAvatarUrl(url:string){
 const u=new URL(url)
 if(u.origin!=='https://www.olbg.com'||u.username||u.password||u.search||u.hash||!/^\/(?:storage\/app\/media\/avatars\/(?:[0-9]+\/)?|uploads\/avatars\/)[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(u.pathname))throw Error('Untrusted avatar URL')
}
