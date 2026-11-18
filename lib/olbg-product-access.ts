// OLBG on-platform tips service, not off-platform businesses or promotions.
// Positive source policy checked 2026-11-18. This is intentionally scoped to
// the published-monthly product, not the global Blogabet access transition.
export const OLBG_PRODUCT_ACCESS = {
 state:'free',
 checkedAt:'2026-11-18',
 sources:['https://www.olbg.com/best-tipsters','https://www.olbg.com/bookmakers/articles/how-use-olbg'],
} as const
export function olbgProductMatchesType(type:'all'|'free'|'paid'|undefined):boolean{
 return type!=='paid'
}
