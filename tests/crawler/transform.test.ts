import { describe, it, expect } from 'vitest'
import { parseBlocks } from '@/crawler/crawl'

const FREE_BLOCK = `
<div class="block row no-padding-lg tipster-block">
  <div class="tipster-info col-lg-10 no-padding">
    <div class="col-md-12 col-lg-5 no-padding">
      <div class="col-xs-12 col-lg-4 col-xlg-3 text-center no-padding avatar">
        <a class="img-md" href="https://test-tipster.blogabet.com" title="Test Tipster" target="_blank">
          <img src="https://cdn.blogabet.com/avatars/abc.jpg" alt="Test Tipster" class="img-circle">
        </a>
      </div>
      <div class="col-xs-12 col-lg-8 text-center no-padding blog">
        <h3 class="name-t u-db u-mb1"><strong>Test Tipster</strong></h3>
        <span class="e-mail u-db u-mb1 text-ellipsis"><a href="https://test-tipster.blogabet.com">test-tipster.blogabet.com</a></span>
        <div class="icons">
          <span class="fa-stack enable-tooltip" data-toggle="tooltip" data-html="true" data-original-title="Verified">
            <i class="fa fa-circle fa-stack-2x"></i>
            <i class="fa fa-check fa-stack-1x fa-inverse"></i>
          </span>
          <img data-toggle="tooltip" data-original-title="Spain" src="https://cdn.blogabet.com/images/flag/spain.png" alt="Spain" />
        </div>
      </div>
    </div>
    <div class="col-xs-12 col-lg-7 text-center no-padding tipsters-data tipster-stats">
      <div class="col-xs-12 pins text-center">
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number">2022</span><span>Since</span></div>
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number">500</span><span>Picks</span></div>
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number text-success">+1234.56</span><span>Profit</span></div>
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number text-success">+24.5%</span><span>Yield</span></div>
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number text-success">87%</span><span>Verified</span></div>
        <div class="col-sh-4 col-xs-2 col-lg-2 no-padding"><span class="number">120</span><span>Followers</span></div>
      </div>
    </div>
  </div>
  <div class="col-xs-12 col-lg-2 no-padding tipsters-data tipster-actions-holder">
    <div class="tipster-actions">
      <div class="subscribe-btns col-lg-12 text-center">
        <a href="javascript:void(0)" onclick="tipsters.showFollowBox('12345')" class="btn btn-default actions _fwl">
          <span class="_follow-text">FOLLOW</span>
        </a>
      </div>
    </div>
  </div>
</div>
`

const PAID_BLOCK = FREE_BLOCK
  .replace("onclick=\"tipsters.showFollowBox('12345')\"", "onclick=\"tipsters.showFollowBox('99999')\"")
  .replace('https://test-tipster.blogabet.com" title="Test Tipster"', 'https://paid-tipster.blogabet.com" title="Paid Tipster"')
  .replace('href="https://test-tipster.blogabet.com"', 'href="https://paid-tipster.blogabet.com"')
  .replace('>Test Tipster<', '>Paid Tipster<')
  .replace('FOLLOW', 'SUBSCRIBE - 9.99€/mo')

const RESET_BLOCK = FREE_BLOCK
  .replace("onclick=\"tipsters.showFollowBox('12345')\"", "onclick=\"tipsters.showFollowBox('77777')\"")
  .replace('https://test-tipster.blogabet.com" title="Test Tipster"', 'https://reset-tipster.blogabet.com" title="Reset Tipster"')
  .replace('href="https://test-tipster.blogabet.com"', 'href="https://reset-tipster.blogabet.com"')
  .replace('>Test Tipster<', '>Reset Tipster<')
  .replace('data-original-title="Verified"', 'data-original-title="Blog stats have been reset 3 times.<br>Last reset at 18."')

describe('parseBlocks', () => {
  it('parses a free tipster block correctly', () => {
    const [t] = parseBlocks(FREE_BLOCK)
    expect(t.id).toBe(12345)
    expect(t.slug).toBe('test-tipster')
    expect(t.name).toBe('Test Tipster')
    expect(t.avatarUrl).toBe('https://cdn.blogabet.com/avatars/abc.jpg')
    expect(t.flagUrl).toBe('https://cdn.blogabet.com/images/flag/spain.png')
    expect(t.sinceYear).toBe(2022)
    expect(t.picks).toBe(500)
    expect(t.profit).toBe('1234.56')
    expect(t.yield).toBe('24.5')
    expect(t.verifiedPct).toBe('87')
    expect(t.followers).toBe(120)
    expect(t.isPaid).toBe(false)
    expect(t.price).toBeNull()
    expect(t.resetCount).toBe(0)
  })

  it('detects paid tipster and extracts price', () => {
    const [t] = parseBlocks(PAID_BLOCK)
    expect(t.id).toBe(99999)
    expect(t.isPaid).toBe(true)
    expect(t.price).toBe('9.99')
  })

  it('parses reset count from tooltip', () => {
    const [t] = parseBlocks(RESET_BLOCK)
    expect(t.resetCount).toBe(3)
  })

  it('returns empty array for empty HTML', () => {
    expect(parseBlocks('<div>no tipsters here</div>')).toHaveLength(0)
  })

  it('parses multiple blocks', () => {
    const results = parseBlocks(FREE_BLOCK + PAID_BLOCK)
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe(12345)
    expect(results[1].id).toBe(99999)
  })
})
