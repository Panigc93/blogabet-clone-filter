import {notFound} from 'next/navigation'
import {OlbgMonthlyPreview} from '@/components/olbg/OlbgMonthlyPreview'
import profiles from '@/tests/fixtures/olbg/published-monthly-real.json'
import type {PublishedMonthlyProfile} from '@/lib/olbg-published-monthly'
export const dynamic='force-dynamic'
export default function Page(){
 if(process.env.LAB_PREVIEW!=='1')notFound()
 return <OlbgMonthlyPreview profiles={profiles as PublishedMonthlyProfile[]}/>
}
