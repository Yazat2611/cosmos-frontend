import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { getDetails } from '../lib/api.js'
import { PLANETS, elementsFromSbdb, jdFromMs, orbitPoints, positionAt } from '../lib/orbits.js'
import { absDate, esc, fmtKm, fmtLd, fmtSize, p2, relDate, sizeM, toLd } from '../lib/format.js'
import { BackendNotice, Caret, Icon, Loading } from '../components/common.jsx'
import { go } from '../lib/ui.js'

const DAY = 864e5
const link = (des) => `#/asteroids/${encodeURIComponent(des)}`
const color = (r) => (r.pha ? 'var(--pha)' : 'var(--accent)')

// ---------- Orbits for the cards: SBDB lookups through the backend, three at a time, kept across visits ----------
const orbits = new Map() // designation -> { el, cls } or null
function useOrbits(designations) {
  const [, setTick] = useState(0)
  const key = designations.join('|')
  useEffect(() => {
    const queue = designations.filter((d) => !orbits.has(d))
    let stopped = false
    const worker = async () => {
      while (!stopped && queue.length) {
        const des = queue.shift()
        if (orbits.has(des)) continue
        try {
          const det = await getDetails(des)
          orbits.set(des, { el: elementsFromSbdb(det), cls: det.object?.orbit_class?.name })
        } catch {
          orbits.set(des, null)
        }
        if (!stopped) setTick((t) => t + 1)
      }
    }
    for (let k = 0; k < 3; k++) worker()
    return () => { stopped = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return orbits
}

// ---------- Approach radar: Earth in the middle, the next 60 days around the dial, distance outward on a log scale ----------
const R = 150
const rOf = (ld) => 14 + ((Math.log10(Math.min(100, Math.max(ld, 0.1))) + 1) / 3) * (R - 22)
const dotR = (h) => (h == null ? 3 : Math.max(2.5, Math.min(7, 13 - h / 2.6)))

function Radar({ list, active }) {
  const now = Date.now()
  const ang = (ms) => ((ms - now) / (60 * DAY)) * 2 * Math.PI - Math.PI / 2
  const at = (ms, r) => [R + Math.cos(ang(ms)) * r, R + Math.sin(ang(ms)) * r]
  return (
    <svg
      viewBox={`-26 -24 ${R * 2 + 52} ${R * 2 + 48}`}
      className="radar"
      role="img"
      aria-label="Close approaches in the next 60 days, by date around the dial and distance from Earth outward"
      onClick={(e) => { const g = e.target.closest('[data-des]'); if (g) go(link(g.dataset.des), 'pointer') }}
      onKeyDown={(e) => { const g = e.target.closest?.('[data-des]'); if (g && e.key === 'Enter') go(link(g.dataset.des), 'keyboard') }}
    >
      <defs>
        <radialGradient id="radar-bg"><stop offset="0" stopColor="rgba(169,196,155,.10)" /><stop offset="1" stopColor="rgba(169,196,155,0)" /></radialGradient>
        <linearGradient id="radar-sweep" x1="0" x2="1"><stop offset="0" stopColor="rgba(169,196,155,0)" /><stop offset="1" stopColor="rgba(169,196,155,.22)" /></linearGradient>
      </defs>
      <circle cx={R} cy={R} r={R} fill="url(#radar-bg)" />
      {[0.1, 1, 10, 100].map((ld) => (
        <g key={ld}>
          <circle cx={R} cy={R} r={rOf(ld)} fill="none" className={ld === 1 ? 'ring moon' : 'ring'} />
          {ld >= 1 && <text x={R - rOf(ld) + 4} y={R - 4} className="ct">{ld} LD</text>}
        </g>
      ))}
      {[0, 7, 14, 21, 28, 35, 42, 49].map((d) => {
        const ms = now + d * DAY
        const [x1, y1] = at(ms, 14)
        const [x2, y2] = at(ms, R)
        const [tx, ty] = at(ms, R + 13)
        return (
          <g key={d}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="spoke" />
            <text x={tx} y={ty + 3} textAnchor="middle" className="ct">{d ? absDate(new Date(ms), false) : 'Today'}</text>
          </g>
        )
      })}
      <g className="sweep">
        <circle cx={R} cy={R} r={R} fill="none" />
        <path d={`M${R},${R} L${R},0 A${R},${R} 0 0,1 ${R + R * Math.sin(0.5)},${R - R * Math.cos(0.5)} Z`} fill="url(#radar-sweep)" transform={`rotate(-28.6 ${R} ${R})`} />
      </g>
      <circle cx={R} cy={R} r="6" fill="#5b9cff" />
      <circle cx={R} cy={R} r="11" fill="none" stroke="rgba(91,156,255,.35)" />
      {list.map((r) => {
        const [x, y] = at(+r.date, rOf(toLd(r.distanceAu)))
        const rr = dotR(r.absoluteMagnitude)
        return (
          <g
            key={r.designation}
            className={`blip${r.pha ? ' pha' : ''}${active === r.designation ? ' on' : ''}`}
            data-des={r.designation}
            tabIndex={0}
            role="button"
            aria-label={`${r.fullName}, ${fmtLd(r.distanceAu)} lunar distances, ${absDate(r.date, false)}`}
            data-tip={`<b>${esc(r.fullName)}</b><br>${fmtLd(r.distanceAu)} LD · ${r.relativeVelocity.toFixed(1)} km/s · ~${fmtSize(r.absoluteMagnitude)}<br><span class='faint'>${absDate(r.date)}</span>`}
          >
            <circle cx={x} cy={y} r="11" fill="transparent" />
            <circle cx={x} cy={y} r={rr} className="b" />
          </g>
        )
      })}
    </svg>
  )
}

// ---------- Size scale: every asteroid against landmarks people know ----------
const REFS = [['Bus', 12], ['Blue whale', 30], ['Statue of Liberty', 93], ['Eiffel Tower', 330], ['Burj Khalifa', 830], ['Central Park', 4000]]
function SizeScale({ list }) {
  const W = 520
  const B = 196
  const x = (m) => 8 + ((Math.log10(Math.min(39000, Math.max(m, 6))) - 0.8) / (4.6 - 0.8)) * (W - 16)
  return (
    <svg
      viewBox={`0 0 ${W} 250`}
      className="sizes"
      role="img"
      aria-label="Estimated asteroid sizes on a log scale, next to familiar landmarks"
      onClick={(e) => { const g = e.target.closest('[data-des]'); if (g) go(link(g.dataset.des), 'pointer') }}
    >
      <line x1="8" x2={W - 8} y1={B} y2={B} className="base" />
      {REFS.map(([l, m], k) => (
        <g key={l}>
          <line x1={x(m)} x2={x(m)} y1={B} y2={B + (k % 2 ? 30 : 12)} className="base" />
          <text x={x(m)} y={B + (k % 2 ? 42 : 24)} textAnchor="middle" className="ct">{l}</text>
          <text x={x(m)} y={B + (k % 2 ? 53 : 35)} textAnchor="middle" className="ct dimt">{m >= 1000 ? `${m / 1000} km` : `${m} m`}</text>
        </g>
      ))}
      {list.filter((r) => r.absoluteMagnitude != null).map((r, k) => {
        const m = sizeM(r.absoluteMagnitude)
        const y = B - 22 - (k % 8) * 21
        return (
          <g key={r.designation} className={`blip${r.pha ? ' pha' : ''}`} data-des={r.designation} data-tip={`<b>${esc(r.fullName)}</b><br>≈ ${fmtSize(r.absoluteMagnitude)} across`}>
            <line x1={x(m)} x2={x(m)} y1={y} y2={B} className="stem" />
            <circle cx={x(m)} cy={y} r="4.5" className="b" />
          </g>
        )
      })}
    </svg>
  )
}

// ---------- Cards ----------
function MiniOrbit({ el, pha }) {
  const S = 34
  if (!el) return <svg viewBox={`0 0 ${S * 2} ${S * 2}`} className="mini-orbit pending" aria-hidden="true"><circle cx={S} cy={S} r="2.6" fill="#ffd889" /><circle cx={S} cy={S} r="20" fill="none" stroke="rgba(91,156,255,.35)" /></svg>
  const jd = jdFromMs(Date.now())
  const pts = orbitPoints(el, jd, 90)
  const ep = orbitPoints(PLANETS[2], jd, 60)
  const maxR = Math.min(3.3, Math.max(1.2, ...pts.map((p) => Math.hypot(p[0], p[1])))) * 1.08
  const k = S / maxR
  const P = (p) => `${(S + p[0] * k).toFixed(1)},${(S - p[1] * k).toFixed(1)}`
  const me = positionAt(el, jd, [0, 0, 0])
  const c = pha ? 'var(--pha)' : 'var(--accent)'
  return (
    <svg viewBox={`0 0 ${S * 2} ${S * 2}`} className="mini-orbit" aria-hidden="true">
      <path d={`M${ep.map(P).join('L')}Z`} fill="none" stroke="rgba(91,156,255,.4)" />
      <path d={`M${pts.map(P).join('L')}Z`} fill="none" stroke={c} strokeWidth="1.3" />
      <circle cx={S} cy={S} r="2.6" fill="#ffd889" />
      <circle cx={S + me[0] * k} cy={S - me[1] * k} r="2.6" fill={c} />
    </svg>
  )
}

// Where the pass falls between 0.1 and 100 LD, with the Moon's distance marked
const meterPct = (ld) => Math.max(2, Math.min(100, ((Math.log10(Math.max(ld, 0.01)) + 1) / 3) * 100))

function Card({ r, orbit, active }) {
  const ld = toLd(r.distanceAu)
  const soon = r.date - Date.now() < 7 * DAY
  return (
    <li>
      <a className={`acard${r.pha ? ' pha' : ''}`} href={link(r.designation)} aria-current={active ? 'true' : undefined}>
        <div className="ac-top">
          <MiniOrbit el={orbit?.el} pha={r.pha} />
          <div className="ac-id">
            <span className="ac-cls">{orbit?.cls || 'Near-Earth asteroid'}</span>
            <b>{r.fullName}</b>
            {r.pha && <span className="badge pha">Hazardous</span>}
          </div>
          <span className={`when${soon ? ' soon' : ''}`}>{relDate(r.date)}</span>
        </div>
        <div className="ac-facts">
          <span><em>Size</em><b className="num">≈ {fmtSize(r.absoluteMagnitude)}</b></span>
          <span><em>Speed</em><b className="num">{r.relativeVelocity.toFixed(1)} km/s</b></span>
          <span><em>Closest</em><b className={`num${ld < 1 ? ' close' : ''}`}>{fmtLd(r.distanceAu)} LD</b></span>
        </div>
        <div className="meter" aria-hidden="true"><i className="moon" style={{ left: `${meterPct(1)}%` }} /><i className="fill" style={{ width: `${meterPct(ld)}%` }} /></div>
        <div className="meter-l" aria-hidden="true"><span>Earth</span><span>Moon</span><span>100 LD</span></div>
      </a>
    </li>
  )
}

// ---------- Table ----------
const KEYS = {
  des: (r) => r.fullName,
  date: (r) => r.date.getTime(),
  dist: (r) => r.distanceAu,
  vel: (r) => -r.relativeVelocity,
  size: (r) => r.absoluteMagnitude ?? 99,
}
function SortHead({ id, sort, children, ...rest }) {
  return (
    <th {...rest}>
      <button type="button" data-sort={id} aria-sort={sort.key === id ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
        {children} <Caret />
      </button>
    </th>
  )
}
function Table({ list, sort, setSort, activeDes }) {
  return (
    <div className="card table-card">
      <table className="table">
        <thead onClick={(e) => { const b = e.target.closest('[data-sort]'); if (b) setSort((s) => (s.key === b.dataset.sort ? { key: s.key, dir: -s.dir } : { key: b.dataset.sort, dir: 1 })) }}>
          <tr>
            <SortHead id="des" sort={sort}>Object</SortHead>
            <SortHead id="date" sort={sort}>Closest approach</SortHead>
            <SortHead id="dist" sort={sort} className="r">Miss distance</SortHead>
            <SortHead id="vel" sort={sort} className="r hide-sm">Velocity</SortHead>
            <SortHead id="size" sort={sort} className="r hide-sm">Est. size</SortHead>
            <th className="r hide-sm">Time ±</th>
          </tr>
        </thead>
        <tbody onClick={(e) => { const tr = e.target.closest('tr[data-des]'); if (tr) go(link(tr.dataset.des), 'pointer') }}>
          {list.map((r) => {
            const ld = toLd(r.distanceAu)
            const frac = Math.min(1, Math.log10(1 + ld) / Math.log10(51))
            return (
              <tr key={r.designation} data-des={r.designation} data-active={activeDes === r.designation ? '' : undefined}>
                <td><div className="des-cell"><span className="des">{r.fullName}</span>{r.pha && <span className="badge pha">PHA</span>}</div></td>
                <td><span>{relDate(r.date)}</span> <span className="faint hide-sm">· {p2(r.date.getUTCHours())}:{p2(r.date.getUTCMinutes())} UTC</span></td>
                <td className="r">
                  <span data-tip={`${fmtKm(r.distanceAu)} · ${r.distanceAu.toFixed(5)} AU<br><span class='faint'>${esc(absDate(r.date))}</span>`}>{fmtLd(r.distanceAu)} LD</span>
                  <span className={`dist-bar${ld < 1 ? ' inside' : ''}`}><i style={{ transform: `scaleX(${frac.toFixed(3)})` }} /></span>
                </td>
                <td className="r hide-sm">{r.relativeVelocity.toFixed(2)} km/s</td>
                <td className="r hide-sm">~{fmtSize(r.absoluteMagnitude)} {r.absoluteMagnitude != null && <span className="faint">H {r.absoluteMagnitude.toFixed(1)}</span>}</td>
                <td className="r hide-sm mono faint">{r.timeUncertanity}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Page ----------
const FILTERS = [['all', 'All'], ['pha', 'Hazardous'], ['moon', 'Inside 1 LD'], ['near', 'Within 10 LD'], ['week', 'Next 7 days']]
const SORTS = [['date', 'Next approach'], ['dist', 'Closest'], ['size', 'Largest'], ['vel', 'Fastest'], ['des', 'Name']]
const PAGE = 48
const readView = () => { try { return localStorage.getItem('cosmos-asteroid-view') || 'grid' } catch { return 'grid' } }

export function Asteroids({ activeDes }) {
  const { rows, status } = useData()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'date', dir: 1 })
  const [view, setView] = useState(readView)
  const [shown, setShown] = useState(PAGE)

  // One row per asteroid: its next pass in the window
  const upcoming = useMemo(() => {
    const now = Date.now()
    const by = new Map()
    for (const r of rows) {
      if (r.date < now) continue
      const cur = by.get(r.designation)
      if (!cur || r.date < cur.date) by.set(r.designation, r)
    }
    return [...by.values()].sort((a, b) => a.date - b.date)
  }, [rows])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const key = KEYS[sort.key]
    const now = Date.now()
    const keep = {
      all: () => true,
      pha: (r) => r.pha,
      moon: (r) => toLd(r.distanceAu) < 1,
      near: (r) => toLd(r.distanceAu) <= 10,
      week: (r) => r.date - now < 7 * DAY,
    }[filter]
    return upcoming
      .filter((r) => keep(r) && (!term || r.fullName.toLowerCase().includes(term) || r.designation.toLowerCase().includes(term)))
      .sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sort.dir)
  }, [upcoming, filter, q, sort])

  const cards = view === 'grid' ? list.slice(0, shown) : []
  const orbitMap = useOrbits(useMemo(() => cards.map((r) => r.designation), [cards]))

  // Pressing / jumps to the search field on this page
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('ast-q')?.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  const setViewSaved = (v) => { setView(v); try { localStorage.setItem('cosmos-asteroid-view', v) } catch { /* optional */ } }

  if (status === 'loading') return <div className="ast"><Loading height={420} /></div>

  const window60 = upcoming.filter((r) => r.date - Date.now() < 60 * DAY)
  const closest = [...window60].sort((a, b) => a.distanceAu - b.distanceAu)[0]
  const biggest = [...window60].filter((r) => r.absoluteMagnitude != null).sort((a, b) => a.absoluteMagnitude - b.absoluteMagnitude)[0]

  return (
    <div className="ast">
      <div className="ast-head">
        <div>
          <div className="eyebrow">Near-Earth objects</div>
          <h1>Asteroids <span className="cnt num">{upcoming.length}</span></h1>
        </div>
        <p className="faint">Every asteroid passing within 0.5 AU of Earth in the next two months, from NASA's close-approach data.</p>
      </div>
      <BackendNotice />
      {upcoming.length > 0 && (
        <section className="viz-row">
          <div className="card radar-card">
            <div className="radar-head">
              <div>
                <div className="eyebrow"><span className="live" />Approach radar · next 60 days</div>
                <h3>{window60.length} passes, {window60.filter((r) => toLd(r.distanceAu) < 1).length} inside the Moon's orbit</h3>
              </div>
              <div className="mc-legend faint"><span><i style={{ background: 'var(--accent)' }} />Near-Earth</span><span><i style={{ background: 'var(--pha)' }} />Hazardous</span><span><i className="ring-k" />Moon's distance</span></div>
            </div>
            <Radar list={window60} active={activeDes} />
          </div>
          <div className="side-viz">
            {closest && (
              <a className="card hl" href={link(closest.designation)}>
                <span className="eyebrow">Closest pass</span>
                <b className="hl-name">{closest.fullName}</b>
                <span className="hl-val pha-t num">{fmtLd(closest.distanceAu)} LD</span>
                <span className="faint">{fmtKm(closest.distanceAu)} · {relDate(closest.date)}</span>
              </a>
            )}
            {biggest && (
              <a className="card hl" href={link(biggest.designation)}>
                <span className="eyebrow">Largest this window</span>
                <b className="hl-name">{biggest.fullName}</b>
                <span className="hl-val num">≈ {fmtSize(biggest.absoluteMagnitude)}</span>
                <span className="faint">{fmtLd(biggest.distanceAu)} LD · {relDate(biggest.date)}</span>
              </a>
            )}
            <div className="card size-card">
              <div><div className="eyebrow">How big are they?</div><h3>From bus-sized rocks to mountains</h3></div>
              <SizeScale list={window60} />
            </div>
          </div>
        </section>
      )}
      <div className="ast-toolbar">
        <div className="chips" role="group" aria-label="Filter">
          {FILTERS.map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(PAGE) }}>{l}</button>)}
        </div>
        <div className="ast-tools">
          <label className="input search"><Icon name="search" /><input id="ast-q" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }} autoComplete="off" /><kbd>/</kbd></label>
          <label className="sortsel"><span>Sort</span>
            <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: 1 })}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <div className="viewseg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'grid'} aria-label="Cards" onClick={() => setViewSaved('grid')}><Icon name="grid" /></button>
            <button type="button" aria-pressed={view === 'table'} aria-label="Table" onClick={() => setViewSaved('table')}><Icon name="rows" /></button>
          </div>
        </div>
      </div>
      {!list.length ? (
        <div className="card empty"><b>No asteroids match</b>Try a different filter or clear the search.</div>
      ) : view === 'table' ? (
        <Table list={list} sort={sort} setSort={setSort} activeDes={activeDes} />
      ) : (
        <>
          <ul className="cards">{cards.map((r) => <Card key={r.designation} r={r} orbit={orbitMap.get(r.designation)} active={activeDes === r.designation} />)}</ul>
          {list.length > shown && <div className="more"><button className="btn" type="button" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</button></div>}
        </>
      )}
    </div>
  )
}
