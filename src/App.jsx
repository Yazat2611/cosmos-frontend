import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useData } from './lib/data.jsx'
import { absDate, fmtLd } from './lib/format.js'
import { go, hideTip, nav, parseHash, useHash } from './lib/ui.js'
import { reduced } from './lib/motion.js'
import { Icon, catLabel, catVar } from './components/common.jsx'
import { Drawer } from './components/Drawer.jsx'
import { Overview } from './views/Overview.jsx'
import { Asteroids } from './views/Asteroids.jsx'
import { Earth } from './views/Earth.jsx'

const NAMES = { overview: 'Overview', asteroids: 'Close approaches', earth: 'Earth events' }
const NAV = [['overview', 'overview'], ['asteroids', 'rock'], ['earth', 'earth']]
const visited = new Set()

// Command palette: opened from the keyboard many times a day, so it appears and leaves instantly
function Palette({ onClose }) {
  const { rows, events } = useData()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef(null)

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const pages = Object.entries(NAMES).filter(([, n]) => !t || n.toLowerCase().includes(t))
      .map(([k, n]) => ({ group: 'Pages', title: n, hash: `#/${k}`, icon: 'page' }))
    const asts = rows.filter((r) => !t || r.fullName.toLowerCase().includes(t)).slice(0, t ? 8 : 5)
      .map((r) => ({ group: 'Asteroids', title: r.fullName, meta: `${fmtLd(r.distanceAu)} LD · ${absDate(r.date, false)}`, hash: `#/asteroids/${encodeURIComponent(r.designation)}`, icon: 'rock' }))
    const evs = events.filter((e) => !t || e.title.toLowerCase().includes(t) || (e.categoryTitle || '').toLowerCase().includes(t)).slice(0, t ? 6 : 3)
      .map((e) => ({ group: 'Earth events', title: e.title, meta: catLabel(e), hash: `#/earth/${e.eventId}`, dot: e.categoryId }))
    return [...pages, ...asts, ...evs]
  }, [q, rows, events])

  const choose = (i) => {
    if (!items[i]) return
    onClose()
    go(items[i].hash, 'keyboard')
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length) setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length)
    } else if (e.key === 'Enter') { e.preventDefault(); choose(index) }
  }
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [index])

  let lastGroup = null
  return (
    <div className="palette-root">
      <div className="palette-backdrop" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" />
          <input autoFocus value={q} placeholder="Search asteroids, events, pages" autoComplete="off" spellCheck="false" onChange={(e) => { setQ(e.target.value); setIndex(0) }} onKeyDown={onKey} />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" role="listbox" ref={listRef}>
          {items.length ? items.map((it, i) => {
            const head = it.group !== lastGroup
            lastGroup = it.group
            return (
              <div key={it.hash}>
                {head && <div className="palette-group">{it.group}</div>}
                <div className="palette-item" role="option" aria-selected={i === index} onPointerMove={() => setIndex(i)} onClick={() => choose(i)}>
                  <span className="ico">{it.dot ? <span className="cat-dot" style={{ '--cat': catVar(it.dot) }} /> : <Icon name={it.icon} />}</span>
                  <span className="t">{it.title}</span><span className="m">{it.meta || ''}</span>
                </div>
              </div>
            )
          }) : <div className="empty" style={{ padding: 28 }}><b>No results</b>Try a designation or an event name.</div>}
        </div>
      </div>
    </div>
  )
}

function ConnectionPill() {
  const { status } = useData()
  const label = status === 'error' ? 'Backend offline' : status === 'loading' ? 'Connecting…' : 'Connected'
  return (
    <div className="sync-pill" data-state={status === 'loading' ? 'running' : 'idle'}>
      <span className="dot" style={status === 'error' ? { background: 'var(--danger)', boxShadow: 'none' } : undefined} />
      <span>{label}</span>
    </div>
  )
}

export default function App() {
  const hash = useHash()
  const { page, sub } = parseHash(hash)
  const { rows, events, status } = useData()
  const [palette, setPalette] = useState(false)
  const viewRef = useRef(null)

  // First visit to a page staggers its blocks; returning visits get a quick fade.
  // Pages reached from the keyboard appear instantly.
  useLayoutEffect(() => {
    hideTip()
    window.scrollTo(0, 0)
    if (status === 'loading') return
    const first = !visited.has(page)
    visited.add(page)
    const root = viewRef.current?.firstElementChild
    if (!root || nav.source === 'keyboard') return
    if (first) root.classList.add('stagger')
    else if (!reduced()) root.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  }, [page, status])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      } else if (e.key === '/' && document.activeElement === document.body) {
        e.preventDefault()
        setPalette(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  let crumb = null
  if (page === 'asteroids' && sub) crumb = rows.find((r) => r.designation === sub)?.fullName || sub
  if (page === 'earth' && sub) crumb = events.find((e) => e.eventId === sub)?.title

  return (
    <>
      <div className="app">
        <aside className="sidebar" aria-label="Main">
          <a className="brand" href="#/overview">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="10.5" ry="4.6" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.4" transform="rotate(-24 12 12)" />
            </svg>
            <span>Cosmos Hub</span>
          </a>
          <nav className="nav">
            {NAV.map(([k, icon]) => (
              <a key={k} href={`#/${k}`} aria-current={page === k ? 'page' : undefined}><Icon name={icon} /><span>{NAMES[k]}</span></a>
            ))}
          </nav>
          <div className="sidebar-foot"><ConnectionPill /></div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="crumbs">
              <span>{NAMES[page]}</span>
              {crumb && <><span className="faint">/</span><b>{crumb}</b></>}
            </div>
            <div className="topbar-right">
              <button className="search-trigger" type="button" onClick={() => setPalette(true)}>
                <Icon name="search" /><span>Search asteroids, events…</span><kbd>⌘K</kbd>
              </button>
            </div>
          </header>
          <main className="view" ref={viewRef} tabIndex={-1} key={page}>
            {page === 'overview' && <Overview />}
            {page === 'asteroids' && <Asteroids activeDes={sub} />}
            {page === 'earth' && <Earth sub={sub} />}
          </main>
        </div>
      </div>
      <Drawer des={page === 'asteroids' ? sub : null} />
      {palette && <Palette onClose={() => setPalette(false)} />}
    </>
  )
}
