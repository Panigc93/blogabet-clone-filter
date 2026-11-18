import {NextRequest,NextResponse} from 'next/server'
import {commonMonthlyLocalEnabled,localCommonMonthlyRead} from '@/lib/olbg-common-local-read'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 if(!commonMonthlyLocalEnabled())return NextResponse.json({error:'not-found'},{status:404})
 try{return NextResponse.json(await localCommonMonthlyRead(req.nextUrl.searchParams))}
 catch(e){return NextResponse.json({reset:true,error:e instanceof Error?e.message:'Invalid read'},{status:409})}
}
