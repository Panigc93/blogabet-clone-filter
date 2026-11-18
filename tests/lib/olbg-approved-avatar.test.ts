import {describe,it,expect} from 'vitest'
import {approvedOlbgAvatar,validateOlbgAvatarUrl} from '@/lib/olbg-approved-avatar'
function fixture(url='https://www.olbg.com/storage/app/media/avatars/test.JPG'){
 // Synthetic node, intentionally includes an unrelated tagged date. No dates
 // need decoding to recover approved scalar photo metadata.
 return {data:[{effectiveTipsterId:1,avatarApproved:2},123,{tipster_id:1,approved:3,deleted_by_user:4,avatar_url:5,upload_time:6},1,0,url,['Date','ignored']]}
}
describe('retained approved OLBG avatars',()=>{
 it('selects whitelisted identity-bound fields without evaluating tagged metadata',()=>{expect(approvedOlbgAvatar(fixture(),123)).toContain('/test.JPG')})
 it('resolves a source-relative avatar on the source origin',()=>{expect(approvedOlbgAvatar(fixture('/uploads/avatars/123_abcdef.webp'),123)).toBe('https://www.olbg.com/uploads/avatars/123_abcdef.webp')})
 it('permits observed numeric per-profile source directories',()=>{expect(()=>validateOlbgAvatarUrl('https://www.olbg.com/storage/app/media/avatars/123/abc.jpg')).not.toThrow()})
 it('keeps missing or unapproved/deleted photos absent',()=>{
  const no:any=fixture();no.data[2]=null;expect(approvedOlbgAvatar(no,123)).toBeNull()
  const deleted:any=fixture();deleted.data[4]=1;expect(approvedOlbgAvatar(deleted,123)).toBeNull()
  const pending:any=fixture();pending.data[3]=0;expect(approvedOlbgAvatar(pending,123)).toBeNull()
 })
 it('rejects identity mismatches and off-origin/credential/query/script URLs',()=>{
  expect(()=>approvedOlbgAvatar(fixture(),124)).toThrow(/identity/)
  for(const u of ['https://evil.invalid/x.jpg','https://user@www.olbg.com/storage/app/media/avatars/a.jpg','javascript:alert(1)','https://www.olbg.com/storage/app/media/avatars/a.jpg?token=1','https://www.olbg.com/storage/app/media/avatars/a.svg'])expect(()=>approvedOlbgAvatar(fixture(u),123)).toThrow()
 })
})
