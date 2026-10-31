import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { absDate, esc, fmtKm, fmtLd, fmtSize, p2, relDate, toLd } from '../lib/format.js'
import { BackendNotice, Caret, Icon, Loading, Segmented } from '../components/common.jsx'
import { go } from '../lib/ui.js'

const KEYS = {
  des: (r) => r.designation,
  date: (r) => r.date.getTime(),
  dist: (r) => r.distanceAu,
  vel: (r) => r.relativeVelocity,
  size: (r) => -(r.absoluteMagnitude ?? 99),
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

export function Asteroids({ activeDes }) {
  const { rows, status, hazard } = useData()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'date', dir: 1 })

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const key = KEYS[sort.key]
    return rows
      .filter((r) => (filter === 'all' || (filter === 'near' ? toLd(r.distanceAu) <= 10 : r.pha)) && (!term || r.fullName.toLowerCase().includes(term)))
      .sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * sort.dir)
  }, [rows, filter, q, sort])

  const near = rows.filter((r) => toLd(r.distanceAu) <= 10).length
  const pha = rows.filter((r) => r.pha).length
  const scanning = hazard.checked < hazard.total

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Close approaches</h1>
          <p>Every asteroid passing within 0.5 AU of Earth in the next two months, from NASA's close-approach data. Refreshed daily at 02:00.</p>
        </div>
      </div>
      <BackendNotice />
      <div className="toolbar">
        <Segmented
          options={[['all', `All ${rows.length}`], ['near', `Within 10 LD ${near}`], ['pha', `Hazardous ${pha}`]]}
          value={filter}
          onChange={setFilter}
        />
        {scanning && <span className="faint" style={{ fontSize: 12 }}>Checking hazard status with NASA: {hazard.checked} of {hazard.total}</span>}
        <div className="grow" />
        <label className="input search"><Icon name="search" /><input placeholder="Filter by designation" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {status === 'loading' ? <Loading height={480} /> : (
        <div className="card table-card">
          <table className="table">
            <thead
              onClick={(e) => {
                const b = e.target.closest('[data-sort]')
                if (b) setSort((s) => (s.key === b.dataset.sort ? { key: s.key, dir: -s.dir } : { key: b.dataset.sort, dir: 1 }))
              }}
            >
              <tr>
                <SortHead id="des" sort={sort}>Object</SortHead>
                <SortHead id="date" sort={sort}>Closest approach</SortHead>
                <SortHead id="dist" sort={sort} className="r">Miss distance</SortHead>
                <SortHead id="vel" sort={sort} className="r hide-sm">Velocity</SortHead>
                <SortHead id="size" sort={sort} className="r hide-sm">Est. size</SortHead>
                <th className="r hide-sm">Time ±</th>
              </tr>
            </thead>
            <tbody
              key={`${filter}|${sort.key}|${sort.dir}`}
              className="rows-enter"
              onClick={(e) => { const tr = e.target.closest('tr[data-des]'); if (tr) go(`#/asteroids/${encodeURIComponent(tr.dataset.des)}`, 'pointer') }}
            >
              {list.length ? list.map((r) => {
                const ld = toLd(r.distanceAu)
                const frac = Math.min(1, Math.log10(1 + ld) / Math.log10(51))
                return (
                  <tr key={r.id} data-des={r.designation} data-active={activeDes === r.designation ? '' : undefined}>
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
              }) : (
                <tr><td colSpan="6"><div className="empty"><b>No approaches match</b>Try a different filter or clear the search.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
