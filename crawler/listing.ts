import * as cheerio from 'cheerio'
import type { TipsterInsert } from '../db/schema'

// Pure listing helpers: no database, no network side effects on import.

// ─── HTML parser ─────────────────────────────────────────────────────────────

function parseNum(text: string): string | null {
  if (!text || text === '—') return null
  const clean = text.replace(/[+%,\s]/g, '').replace(/,/g, '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : String(n)
}

export function parseBlocks(html: string, lastActive = 12): TipsterInsert[] {
  const $ = cheerio.load(html)
  const results: TipsterInsert[] = []

  $('.tipster-block').each((_, el) => {
    try {
      const $el = $(el)

      // ID from onclick="tipsters.showFollowBox('637581')"
      const onclick = $el.find('[onclick*="showFollowBox"]').attr('onclick') ?? ''
      const idMatch = onclick.match(/showFollowBox\('(\d+)'\)/)
      if (!idMatch) return
      const id = parseInt(idMatch[1], 10)

      // Slug from https://criteriofutbol.blogabet.com
      const href = $el.find('.avatar a').attr('href') ?? ''
      const slugMatch = href.match(/https?:\/\/([^.]+)\.blogabet\.com/)
      if (!slugMatch) return
      const slug = slugMatch[1]

      // Name
      const name = $el.find('h3.name-t strong').text().trim()
        || $el.find('.avatar a').attr('title') || slug

      // Avatar
      const avatarUrl = $el.find('.avatar img.img-circle').attr('src') ?? null

      // Flag (img inside .icons that is NOT inside a fa-stack)
      const flagUrl = $el.find('.icons > img').attr('src') ?? null

      // Account verification badge, separate from the "Verified" picks percentage.
      const iconTitles = $el.find('.icons .fa-stack[data-original-title]')
        .map((_, n) => $(n).attr('data-original-title') ?? '')
        .get()
      const verifiedTitle = iconTitles.find(title => /verified|verificado/i.test(title)) ?? ''
      const isVerified = verifiedTitle !== '' && !/not\s+verified|unverified|no\s+verific/i.test(verifiedTitle)

      // Stats — 6 .number spans: Since, Picks, Profit, Yield, Verified%, Followers
      const nums = $el.find('.pins .number').map((_, n) => $(n).text().trim()).get()
      const sinceYear  = nums[0] ? parseInt(nums[0], 10) : null
      const picks      = nums[1] ? parseInt(nums[1], 10) : 0
      const profit     = parseNum(nums[2] ?? '')
      const yieldVal   = parseNum((nums[3] ?? '').replace('%', ''))
      const verifiedPct = parseNum((nums[4] ?? '').replace('%', ''))
      const followers  = nums[5] ? parseInt(nums[5], 10) : 0

      // Reset count + last reset date — tooltip: "Blog stats have been reset 3 times. Last reset on 25 Nov 2023."
      const resetTitle = $el.find('[data-original-title*="reset"]').attr('data-original-title') ?? ''
      const resetMatch = resetTitle.match(/reset\s+(\d+)\s+time/i)
      const resetCount = resetMatch ? parseInt(resetMatch[1], 10) : 0

      // Try to parse a date from the reset tooltip (various formats blogabet may use)
      let lastResetAt: Date | null = null
      const dateMatch = resetTitle.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i)
        ?? resetTitle.match(/(\d{4})-(\d{2})-(\d{2})/)
        ?? resetTitle.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (dateMatch) {
        const parsed = new Date(dateMatch[0])
        if (!isNaN(parsed.getTime())) lastResetAt = parsed
      }

      // isPaid + price
      // .btn-subscribe exists on FREE tipsters too (follow button) — can't use for isPaid
      // Use price regex (broader selectors) or special plan text in .subscribe-btns block
      const $subscribeBlock = $el.find('.subscribe-btns')
      const subscribeBlockText = $subscribeBlock.text()
      const priceText = $el.find('.subscribe-btns, .btn-subscribe, .tipster-price').text()
      const priceMatch = priceText.match(/(\d+(?:[.,]\d+)?)\s*€/)
      const hasSpecialPlan = /full.?service|season.?break|by.?request/i.test(subscribeBlockText)
      const isPaid = !!priceMatch || ($subscribeBlock.length > 0 && hasSpecialPlan)
      const price = priceMatch ? priceMatch[1].replace(',', '.') : null

      results.push({
        id,
        slug,
        name,
        avatarUrl,
        flagUrl,
        countryCode: null,
        isPaid,
        price,
        sinceYear:   !sinceYear || isNaN(sinceYear) ? null : sinceYear,
        picks:       isNaN(picks) ? 0 : picks,
        profit,
        yield:       yieldVal,
        verifiedPct,
        isVerified,
        followers:   isNaN(followers) ? 0 : followers,
        lastPickAt:  lastActive <= 1 ? new Date() : null, // only set for monthly-active crawl
        resetCount:  isNaN(resetCount) ? 0 : resetCount,
        lastResetAt,
        updatedAt:   new Date(),
      })
    } catch (err) {
      console.error('Error parsing block:', err)
    }
  })

  return results
}

// ─── Build Blogabet URL ───────────────────────────────────────────────────────

// Listing order. Candidate: 'followers' (the site's own default). 'yield' made the
// listing endpoint answer HTTP 500 after ~26 s in the official UI on 2026-11-15.
// Only changes traversal order, not the filter set (lastActive and the rest are unchanged).
export const CATALOG_ORDER = 'followers'

export function blogabetUrl(lastActive: number, start: number): string {
  const url = new URL('https://blogabet.com/tipsters/')
  url.searchParams.set('f[language]', 'all')
  url.searchParams.set('f[pickType]', 'all')
  url.searchParams.set('f[sport]', 'all')
  url.searchParams.set('f[leagues]', 'all')
  url.searchParams.set('f[picksOver]', '0')
  url.searchParams.set('f[lastActive]', String(lastActive))
  url.searchParams.set('f[bookiesUsed]', 'null')
  url.searchParams.set('f[order]', CATALOG_ORDER)
  url.searchParams.set('f[start]', String(start))
  return url.toString()
}

export const COMMON_HEADERS = {
  'accept': '*/*',
  'accept-language': 'en,es-ES;q=0.9,es;q=0.8',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'referer': 'https://blogabet.com/tipsters',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Linux"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
}

