import { useEffect, useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn, COLOR, WORD, type Status } from "@/lib/utils"

export function Button({ className, tone = "dark", ...p }: React.ComponentProps<"button"> & { tone?: "dark" | "light" | "slate" | "ghost" }) {
  const t = { dark: "bg-tile2 text-ink hover:bg-[#2e3035] border border-edge", light: "bg-cream text-[#1c1d20] hover:bg-white",
    slate: "bg-slate text-white hover:bg-[#6a7ea6]", ghost: "text-mute hover:text-ink" }[tone]
  return <button className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-[4px] px-4 text-[13px] font-medium transition-colors disabled:opacity-40", t, className)} {...p} />
}

export function Tile({ className, title, action, children }: { className?: string; title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn("tile flex min-w-0 flex-col p-5", className)}>
      {(title || action) && <header className="mb-4 flex items-start justify-between gap-3"><h2 className="text-[15px] font-semibold">{title}</h2>{action}</header>}
      {children}
    </section>
  )
}

export function StatusPill({ s, label }: { s: Status; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-tile2 px-2 py-0.5 text-[11px] font-medium" style={{ color: COLOR[s] }}>
      <span className="size-1.5 rounded-full" style={{ background: COLOR[s] }} />{label ?? WORD[s]}
    </span>
  )
}

export function Field({ label, unit, hint, children }: { label: string; unit?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex justify-between text-[12px] text-mute"><span>{label}</span>{unit && <span>{unit}</span>}</span>
      {children}
      {hint && <span className="text-[11px] text-mute/80">{hint}</span>}
    </label>
  )
}

export function Num({ value, onChange, min, max, step = 1, placeholder }:
  { value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return <input type="number" inputMode="decimal" className="num" value={value ?? ""} min={min} max={max} step={step} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 py-1.5 text-left text-[13px]">
      <span>{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-slate" : "bg-tile2 border border-edge")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-cream transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  )
}

/** Native <dialog>: focus trap, Esc to close, backdrop click to close. side=true -> right drawer. */
export function Sheet({ open, onClose, title, side, children }: { open: boolean; onClose: () => void; title: string; side?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close() }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label={title}
      className={cn("m-0 max-h-dvh p-0", side ? "ml-auto h-dvh w-full max-w-md" : "mx-auto my-auto w-full max-w-lg")}>
      <div className={cn("tile flex h-full flex-col overflow-auto p-6", side && "rounded-none border-y-0 border-r-0")}>
        <header className="mb-5 flex items-center justify-between"><h2 className="dot text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-[4px] bg-tile2 text-mute hover:text-ink"><X className="size-4" /></button></header>
        {children}
      </div>
    </dialog>
  )
}

/** Dot-matrix columns, like a segment display. values in [0,1]. */
export function DotBars({ values, colors, rows = 8, className }: { values: number[]; colors?: string[]; rows?: number; className?: string }) {
  return (
    <div className={cn("flex items-end gap-[3px]", className)} aria-hidden>
      {values.map((v, i) => (
        <div key={i} className="flex flex-col-reverse gap-[3px]">
          {Array.from({ length: rows }, (_, r) => <span key={r} className="size-[5px] rounded-[1px]" style={{ background: r < Math.round(v * rows) ? colors?.[i] ?? "#8ea0c4" : "#2f3136" }} />)}
        </div>
      ))}
    </div>
  )
}
