import assert from 'node:assert/strict'
import test from 'node:test'

import { chainHubFallback, chainHubTitle } from '../scripts/generate-sitemap.js'

const branches = [
  { slug: 'syrovarnya-moscow', name: 'Сыроварня Москва' },
  { slug: 'syrovarnya-sochi', name: 'Сыроварня Сочи' },
]

test('prerendered hub fallback includes API SEO title, description, and intro', () => {
  const seo = {
    title: 'Сыроварня — меню сети с КБЖУ',
    description: '76 филиалов и 214 блюд с КБЖУ.',
    introText: 'В сети 76 филиалов и 214 позиций итальянской кухни.',
  }
  const html = chainHubFallback('syrovarnya', 'Сыроварня', branches, 214, seo)
  assert.equal(chainHubTitle('Сыроварня', seo), seo.title)
  assert.match(html, new RegExp(seo.introText))
  assert.match(html, new RegExp(seo.description))
  assert.match(html, /syrovarnya-moscow/)
  assert.match(html, /syrovarnya-sochi/)
})

test('prerendered hub fallback keeps the legacy output without SEO', () => {
  const html = chainHubFallback('syrovarnya', 'Сыроварня', branches, 214)
  assert.equal(chainHubTitle('Сыроварня'), 'Сыроварня — адреса и меню сети с КБЖУ')
  assert.match(html, /214 блюд/)
  assert.doesNotMatch(html, /introText|итальянской кухни/)
})
