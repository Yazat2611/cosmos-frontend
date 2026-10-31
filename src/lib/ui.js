// Small imperative UI services that sit outside React: routing and tooltips.
import { useSyncExternalStore } from 'react'

// ---------- Hash router ----------
const subscribe = (cb) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const PAGES = ['overview', 'asteroids', 'earth']
export function parseHash(hash) {
  const [, page = 'overview', ...rest] = hash.replace(/^#/, '').split('/')
  return { page: PAGES.includes(page) ? page : 'overview', sub: rest.length ? decodeURIComponent(rest.join('/')) : null }
}
export const useHash = () => useSyncExternalStore(subscribe, () => location.hash)

// Navigation that started from the keyboard appears instantly; pointer navigation animates
export const nav = { source: 'pointer' }
document.addEventListener('keydown', () => { nav.source = 'keyboard' }, true)
document.addEventListener('pointerdown', () => { nav.source = 'pointer' }, true)
export function go(hash, source) {
  if (source) nav.source = source
  location.hash = hash
}

// ---------- Tooltip: a delay on the first, instant for neighbours ----------
let timer = 0
let hiddenAt = 0
let shown = false
export function showTip(target, html) {
  const tip = document.getElementById('tooltip')
  clearTimeout(timer)
  const warm = shown || Date.now() - hiddenAt < 400
  const place = () => {
    tip.innerHTML = html
    const r = target.getBoundingClientRect()
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const x = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8))
    let y = r.top - th - 8
    const below = y < 8
    if (below) y = r.bottom + 8
    tip.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
    tip.style.setProperty('--origin', `${r.left + r.width / 2 - x}px ${below ? '0%' : '100%'}`)
    tip.toggleAttribute('data-instant', warm)
    tip.setAttribute('data-show', '')
    shown = true
  }
  if (warm) place()
  else timer = setTimeout(place, 320)
}
export function hideTip() {
  const tip = document.getElementById('tooltip')
  clearTimeout(timer)
  if (shown) hiddenAt = Date.now()
  shown = false
  tip.removeAttribute('data-instant')
  tip.removeAttribute('data-show')
}
export function installTips() {
  document.addEventListener('pointerover', (e) => {
    const n = e.pointerType === 'mouse' && e.target.closest?.('[data-tip]')
    if (n) showTip(n, n.dataset.tip)
  })
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tip]')) hideTip()
  })
}
