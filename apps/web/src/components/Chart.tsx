import { useMemo, useState } from "react"

interface Line { y: number[]; color: string; label: string; dash?: boolean; width?: number }
interface Props { x: number[]; lines: Line[]; band?: { lo: number[]; hi: number[]; color: string }; refs?: { y: number; label: string; color: string }[]
  xLabel?: string; unit?: string; height?: number; marks?: boolean[] }

/** Small dependency-free SVG line chart with a hover readout. */
export function Chart({ x, lines, band, refs = [], xLabel, unit = "", height = 260, marks }: Props) {
  const [hover, setHover] = useState<number>()
  const W = 720, H = height, L = 40, R = 12, T = 12, B = 28
  const { x0, x1, y0, y1 } = useMemo(() => {
    const ys = [...lines.flatMap((l) => l.y), ...(band ? [...band.lo, ...band.hi] : []), ...refs.map((r) => r.y)].filter(Number.isFinite)
    const lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.08 || 5
    return { x0: x[0], x1: x[x.length - 1], y0: Math.floor(lo - pad), y1: Math.ceil(hi + pad) }
  }, [x, lines, band, refs])
  const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)
  const path = (y: number[]) => y.map((v, i) => `${i ? "L" : "M"}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`).join("")
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4)
  const xt = Array.from({ length: 6 }, (_, i) => x0 + ((x1 - x0) * i) / 5)
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W
    const v = x0 + ((px - L) / (W - L - R)) * (x1 - x0)
    let best = 0; for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - v) < Math.abs(x[best] - v)) best = i
    setHover(best)
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(undefined)} role="img"
        aria-label={lines.map((l) => l.label).join(", ")}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="#2f3136" /><text x={L - 8} y={sy(t) + 4} fill="#8d8f96" fontSize="11" textAnchor="end">{Math.round(t)}</text></g>)}
        {xt.map((t) => <text key={t} x={sx(t)} y={H - 8} fill="#8d8f96" fontSize="11" textAnchor="middle">{Math.round(t)}</text>)}
        {marks && marks.map((m, i) => m && i < x.length - 1 ? <rect key={i} x={sx(x[i])} width={Math.max(1, sx(x[i + 1]) - sx(x[i]))} y={T} height={H - T - B} fill="#e2ad4c" opacity={0.08} /> : null)}
        {band && <path d={`${path(band.hi)}${band.lo.map((_, i) => `L${sx(x[band.lo.length - 1 - i]).toFixed(1)},${sy(band.lo[band.lo.length - 1 - i]).toFixed(1)}`).join("")}Z`} fill={band.color} opacity={0.18} />}
        {refs.map((r) => <g key={r.label}><line x1={L} x2={W - R} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color} strokeDasharray="4 4" /><text x={W - R} y={sy(r.y) - 5} fill={r.color} fontSize="11" textAnchor="end">{r.label}</text></g>)}
        {lines.map((l) => <path key={l.label} d={path(l.y)} fill="none" stroke={l.color} strokeWidth={l.width ?? 1.6} strokeDasharray={l.dash ? "4 4" : undefined} />)}
        {hover !== undefined && <line x1={sx(x[hover])} x2={sx(x[hover])} y1={T} y2={H - B} stroke="#8d8f96" strokeWidth={0.6} />}
      </svg>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-mute">
        {lines.map((l) => <span key={l.label} className="flex items-center gap-2"><span className="h-[2px] w-4" style={{ background: l.color }} />{l.label}
          {hover !== undefined && <b className="num font-medium text-ink">{l.y[hover]?.toFixed(0)}{unit}</b>}</span>)}
        {xLabel && <span className="ml-auto">{hover !== undefined ? `${xLabel} ${x[hover].toFixed(0)}` : xLabel}</span>}
      </div>
    </div>
  )
}
