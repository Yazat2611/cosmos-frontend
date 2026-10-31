import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDetails } from '../lib/api.js'
import { useData } from '../lib/data.jsx'
import { absDate, fmtKm, fmtLd, fmtSize, MONTHS, plural, sizeM, toLd } from '../lib/format.js'
import { orbitPlayer, rockAvatar } from '../lib/motion.js'
import { go } from '../lib/ui.js'
import { Icon } from './common.jsx'

const isMobile = () => matchMedia('(max-width: 760px)').matches

function OrbitDiagram({ det }) {
  const svgRef = useRef(null)
  const pathRef = useRef(null)
  const [date, setDate] = useState('Today')
  const [playing, setPlaying] = useState(true)
  const player = useRef(null)

  const E = Object.fromEntries(det.orbit.elements.map((x) => [x.name, x]))
  const a = +E.a.value
  const e = +E.e.value
  const w = ((+E.om.value + +E.w.value) * Math.PI) / 180
  // Frame the asteroid's ellipse together with Earth's orbit, then fit that box into the canvas
  let x0 = -1, x1 = 1, y0 = -1, y1 = 1
  for (let k = 0; k < 360; k += 2) {
    const t = (k * Math.PI) / 180
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(t))
    const px = r * Math.cos(t + w)
    const py = -r * Math.sin(t + w)
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
  }
  const S = Math.min(296 / (x1 - x0), 250 / (y1 - y0)) // px per AU on a 340 x 300 canvas
  const cx = ((x0 + x1) / 2) * S
  const cy = ((y0 + y1) / 2) * S
  const pts = []
  for (let k = 0; k <= 180; k++) {
    const nu = (k / 180) * Math.PI * 2
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu))
    pts.push(`${(r * Math.cos(nu + w) * S).toFixed(1)} ${(-r * Math.sin(nu + w) * S).toFixed(1)}`)
  }
  const [L0] = useState(() => (100.46 + 0.98565 * ((Date.now() - Date.UTC(2000, 0, 1, 12)) / 864e5)) % 360)
  const qx = a * (1 - e) * Math.cos(w) * S
  const qy = -a * (1 - e) * Math.sin(w) * S
  const ma = +E.ma.value
  const n = +E.n.value

  useEffect(() => {
    pathRef.current.style.setProperty('--len', pathRef.current.getTotalLength().toFixed(1))
    const p = orbitPlayer(svgRef.current, {
      a, e, w, S, ma, n, L0,
      onDate: (days) => {
        const d = new Date(Date.now() + days * 864e5)
        setDate(days < 1 ? 'Today' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`)
      },
    })
    player.current = p
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(p.playing)
    return () => p.destroy()
  }, [a, e, w, S, ma, n, L0])

  return (
    <div className="orbit-box">
      <svg ref={svgRef} viewBox={`${(cx - 170).toFixed(1)} ${(cy - 150).toFixed(1)} 340 300`} aria-label="Orbit diagram">
        {[0.387, 0.723, 1.524].map((r) => <circle key={r} r={r * S} fill="none" stroke="rgba(255,255,255,.07)" />)}
        <circle r={S} fill="none" stroke="#5b8cff" strokeOpacity=".7" strokeWidth="1.2" />
        <path ref={pathRef} className="orbit-path" d={`M${pts.join('L')}Z`} fill="none" stroke="#ffb547" strokeWidth="1.4" />
        <circle r="7" fill="#ffd28a" /><circle r="14" fill="#ffd28a" opacity=".12" />
        <g className="orbit-body">
          <circle data-earth="" r="4" fill="#5b8cff" />
          <circle data-ast="" r="3.2" fill="#ffb547" style={{ filter: 'drop-shadow(0 0 4px rgba(255,181,71,.8))' }} />
          <circle cx={qx.toFixed(1)} cy={qy.toFixed(1)} r="1.6" fill="#fff" opacity=".6" />
          <text x={(qx - Math.cos(w) * 8).toFixed(1)} y={(qy + Math.sin(w) * 8 + 3).toFixed(1)} textAnchor={Math.cos(w) >= 0 ? 'end' : 'start'} fill="rgba(255,255,255,.45)" fontSize="9">
            perihelion {(+E.q.value).toFixed(2)} AU
          </text>
        </g>
      </svg>
      <div className="orbit-legend">
        <span style={{ color: '#5b8cff' }}><i />Earth</span>
        <span style={{ color: '#ffb547' }}><i />{det.object.fullname}</span>
      </div>
      <div className="orbit-clock">
        <span className="num">{date}</span>
        <button
          className="icon-btn"
          type="button"
          aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
          onClick={() => { player.current.toggle(); setPlaying(player.current.playing) }}
        >
          <span className="swap">
            <span data-hide={playing ? undefined : ''}><Icon name="pause" /></span>
            <span data-hide={playing ? '' : undefined}><Icon name="play" /></span>
          </span>
        </button>
      </div>
    </div>
  )
}

function Details({ det }) {
  const o = det.orbit
  const arcDays = o.first_obs && o.last_obs ? Math.round((new Date(o.last_obs) - new Date(o.first_obs)) / 864e5) : null
  const hasOrbit = ['a', 'e', 'om', 'w', 'ma', 'n', 'q'].every((k) => o.elements?.some((x) => x.name === k && x.value != null))
  return (
    <>
      {hasOrbit && (
        <div className="d-section">
          <h3>Orbit, seen from above the ecliptic</h3>
          <OrbitDiagram det={det} />
        </div>
      )}
      <div className="d-section">
        <h3>Observations</h3>
        <dl className="kv">
          {o.moid != null && <div><dt>Earth MOID</dt><dd>{(+o.moid).toFixed(5)} AU <span className="faint">· {toLd(+o.moid).toFixed(1)} LD</span></dd></div>}
          {o.n_obs_used != null && <div><dt>Observations used</dt><dd>{o.n_obs_used.toLocaleString()}</dd></div>}
          {o.first_obs && <div><dt>First observed</dt><dd>{o.first_obs}</dd></div>}
          {o.last_obs && <div><dt>Last observed</dt><dd>{o.last_obs}</dd></div>}
          {arcDays != null && <div><dt>Data arc</dt><dd>{plural(arcDays, 'day', 'days')}</dd></div>}
          {o.rms != null && <div><dt>Fit RMS</dt><dd>{o.rms}″</dd></div>}
        </dl>
      </div>
      <div className="d-section">
        <h3>Orbital elements · epoch JD {o.epoch}</h3>
        <table className="el-table">
          <tbody>
            {(o.elements || []).map((x) => (
              <tr key={x.name}>
                <td>{x.label}</td>
                <td><div>{x.value} <span className="faint">{x.units || ''}</span></div><div className="t">{x.title}</div></td>
                <td className="r faint mono">{x.sigma != null && `±${x.sigma}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Skeleton() {
  return (
    <>
      <div className="d-section"><h3>Orbit</h3><div className="skel" style={{ height: 260, borderRadius: 12 }} /></div>
      <div className="d-section"><h3>Orbital elements</h3>{Array.from({ length: 6 }, (_, i) => <div key={i} className="skel" style={{ height: 14, margin: '12px 0' }} />)}</div>
    </>
  )
}

function Body({ des, onClose }) {
  const { rows } = useData()
  const a = rows.find((r) => r.designation === des && r.date > Date.now()) || rows.find((r) => r.designation === des)
  const [state, setState] = useState({ status: 'loading' })
  const [copied, setCopied] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const rock = useRef(null)
  const closeBtn = useRef(null)

  useEffect(() => {
    let live = true
    getDetails(des).then(
      (det) => { if (live) setState({ status: 'ready', det }) },
      () => { if (live) setState({ status: 'error' }) },
    )
    return () => { live = false }
  }, [des, attempt])

  const h = a?.absoluteMagnitude
  useEffect(() => {
    const l = rockAvatar(rock.current, des, h == null ? 0.5 : Math.min(1, Math.log10(sizeM(h)) / 3.2))
    closeBtn.current.focus({ preventScroll: true })
    return () => l.destroy()
  }, [des, h])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  const det = state.det
  return (
    <>
      <header className="d-head">
        <div>
          {a && <div className="faint" style={{ fontSize: 12 }}>Close approach · {absDate(a.date)}</div>}
          <div className="d-title"><canvas className="rock-avatar" ref={rock} aria-hidden="true" /><h2 id="drawerTitle">{det?.object.fullname || a?.fullName || des}</h2></div>
          <div className="badges">
            <span className="badge">NEO</span>
            {det?.object.pha && <span className="badge pha">Potentially hazardous</span>}
            {det?.object.orbit_class && <span className="badge accent" data-tip={`Orbit class ${det.object.orbit_class.code}`}>{det.object.orbit_class.name}</span>}
            {det && <span className="badge">SPK {det.object.spkid}</span>}
          </div>
        </div>
        <div className="actions">
          <button className="icon-btn" type="button" aria-label="Copy designation" data-tip="Copy designation" onClick={() => { navigator.clipboard?.writeText(des).catch(() => {}); setCopied(true) }}>
            <span className="swap"><span data-hide={copied ? '' : undefined}><Icon name="copy" /></span><span data-hide={copied ? undefined : ''}><Icon name="check" /></span></span>
          </button>
          <a className="icon-btn" href={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(des)}`} target="_blank" rel="noopener noreferrer" aria-label="Open in JPL Small-Body Database" data-tip="Open in JPL SBDB"><Icon name="ext" /></a>
          <button className="icon-btn" type="button" ref={closeBtn} aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
      </header>
      {a && (
        <div className="d-section">
          <h3>This pass</h3>
          <dl className="kv">
            <div><dt>Miss distance</dt><dd>{fmtLd(a.distanceAu)} LD <span className="faint">· {fmtKm(a.distanceAu)}</span></dd></div>
            {a.minimumDistance != null && <div><dt>Range (3σ)</dt><dd>{toLd(a.minimumDistance).toFixed(2)}–{toLd(a.maximumDistance).toFixed(2)} LD</dd></div>}
            <div><dt>Relative velocity</dt><dd>{a.relativeVelocity.toFixed(2)} km/s</dd></div>
            {a.infVelocity != null && <div><dt>Velocity at infinity</dt><dd>{a.infVelocity.toFixed(2)} km/s</dd></div>}
            {h != null && <div><dt>Absolute magnitude</dt><dd>H {h.toFixed(2)} <span className="faint">· ~{fmtSize(h)}</span></dd></div>}
            <div><dt>Time uncertainty</dt><dd className="mono">{a.timeUncertanity}</dd></div>
          </dl>
        </div>
      )}
      {state.status === 'loading' && <Skeleton />}
      {state.status === 'error' && (
        <div className="d-section">
          <div className="notice" role="alert">
            <span>Couldn't load this object from NASA.</span>
            <button className="btn" type="button" onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1) }}>Try again</button>
          </div>
        </div>
      )}
      {state.status === 'ready' && <Details key={des} det={det} />}
    </>
  )
}

// Slides in from the right; on phones it becomes a bottom sheet with drag-to-dismiss
export function Drawer({ des }) {
  const root = useRef(null)
  const drawer = useRef(null)
  const restore = useRef(null)
  const [shown, setShown] = useState(des)

  const close = useCallback((instant) => {
    if (instant) root.current?.setAttribute('data-instant', '')
    go('#/asteroids', instant ? 'keyboard' : 'pointer')
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (des) setShown(des) }, [des])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    if (des) {
      restore.current = restore.current || document.activeElement
      el.hidden = false
      void drawer.current.offsetWidth // commit the closed position before transitioning
      el.setAttribute('data-open', '')
      document.body.style.overflow = 'hidden'
      return
    }
    el.removeAttribute('data-open')
    document.body.style.overflow = ''
    drawer.current.style.transform = ''
    restore.current?.focus?.({ preventScroll: true })
    restore.current = null
    const instant = el.hasAttribute('data-instant')
    const done = () => { el.hidden = true; el.removeAttribute('data-instant'); setShown(null) }
    if (instant) { done(); return }
    const t = setTimeout(done, 460)
    return () => clearTimeout(t)
  }, [des])

  useEffect(() => {
    if (!des) return
    const onKey = (e) => { if (e.key === 'Escape' && document.querySelector('.palette-root') == null) close(true) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [des, close])

  // Sheet drag: follow the finger, dismiss on distance or a flick
  const drag = useRef(null)
  const onDown = (e) => {
    if (drag.current || !isMobile()) return
    drag.current = { y: e.clientY, t: Date.now(), dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawer.current.setAttribute('data-dragging', '')
  }
  const onMove = (e) => {
    if (!drag.current) return
    const raw = e.clientY - drag.current.y
    drag.current.dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw // friction when pulling up past the top
    drawer.current.style.transform = `translateY(${drag.current.dy}px)`
  }
  const onUp = () => {
    if (!drag.current) return
    const { dy, t } = drag.current
    drag.current = null
    drawer.current.removeAttribute('data-dragging')
    drawer.current.style.transform = ''
    if (dy > 140 || dy / Math.max(1, Date.now() - t) > 0.11) close(false)
  }

  const current = des || shown
  return (
    <div className="drawer-root" ref={root} hidden>
      <div className="backdrop" onClick={() => close(false)} />
      <section className="drawer" ref={drawer} role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
        <div className="drawer-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}><span /></div>
        <div className="drawer-body">{current && <Body key={current} des={current} onClose={() => close(false)} />}</div>
      </section>
    </div>
  )
}
