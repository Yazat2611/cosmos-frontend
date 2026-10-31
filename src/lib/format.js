const LD_AU = 0.00256955529
const AU_KM = 149597870.7
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The backend serialises LocalDateTime as [y, m, d, h, min, s] or as an ISO string, both in UTC
export function toDate(v) {
  if (Array.isArray(v)) {
    const [y, m, d, h = 0, min = 0, s = 0] = v
    return new Date(Date.UTC(y, m - 1, d, h, min, s))
  }
  if (typeof v === 'string') return new Date(/[zZ]$/.test(v) ? v : `${v}Z`)
  return null
}

export const toLd = (au) => au / LD_AU
export const fmtLdValue = (ld) => (ld < 10 ? ld.toFixed(2) : ld < 100 ? ld.toFixed(1) : String(Math.round(ld)))
export const fmtLd = (au) => fmtLdValue(toLd(au))
export const fmtKm = (au) => {
  const km = au * AU_KM
  return km < 1e6 ? `${Math.round(km / 1000).toLocaleString()}k km` : `${(km / 1e6).toFixed(km < 1e7 ? 2 : 1)}M km`
}

// Diameter estimate from absolute magnitude, assuming a typical albedo of 0.14
export const sizeM = (h) => (h == null ? null : (1329 / Math.sqrt(0.14)) * Math.pow(10, -h / 5) * 1000)
export const fmtSize = (h) => {
  const m = sizeM(h)
  if (m == null) return '—'
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}

export const p2 = (n) => String(n).padStart(2, '0')
export const absDate = (d, time = true) =>
  `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${time ? `, ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC` : ''}`

const pr = new Intl.PluralRules('en')
export const plural = (n, one, many) => `${n.toLocaleString('en')} ${pr.select(n) === 'one' ? one : many}`

// Relative within a week, absolute after (an approach "in 41 days" is harder to place than "Dec 9")
export function relDate(d) {
  const diff = d.getTime() - Date.now()
  const a = Math.abs(diff)
  const H = 3600e3
  const D = 24 * H
  if (a > 7 * D) return absDate(d, false)
  if (a < 60e3) return 'just now'
  let s
  if (a < H) s = `${Math.round(a / 60e3)} min`
  else if (a < D) s = `${Math.round(a / H)} h`
  else s = plural(Math.round(a / D), 'day', 'days')
  return diff < 0 ? `${s} ago` : `in ${s}`
}
