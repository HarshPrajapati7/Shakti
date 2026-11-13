import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// shadcn/ui (new-york) primitives, restyled to the ASTRA palette.

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-medium tracking-[0.08em] uppercase transition-colors duration-200 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        solid: "bg-ink text-void hover:bg-white",
        outline: "border border-ink/70 text-ink hover:bg-ink hover:text-void",
        ghost: "text-mute hover:text-ink",
      },
      size: { md: "h-11 px-6", sm: "h-8 px-3 text-[11px]" },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
)

export function Button({ className, variant, size, asChild, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("border border-line bg-panel/80 p-5", className)} {...props} />
}

export function Badge({ className, color, children }: { className?: string; color: string; children: React.ReactNode }) {
  return (
    <span className={cn("label inline-flex items-center gap-1.5 !text-[10px]", className)} style={{ color }}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {children}
    </span>
  )
}

export function Slider({ className, label, valueText, ...props }:
  React.ComponentProps<typeof SliderPrimitive.Root> & { label: string; valueText: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num text-sm text-ink">{valueText}</span>
      </div>
      <SliderPrimitive.Root className="relative flex h-5 touch-none select-none items-center" aria-label={label} {...props}>
        <SliderPrimitive.Track className="relative h-px grow bg-line">
          <SliderPrimitive.Range className="absolute h-full bg-holo" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-3.5 rotate-45 border border-holo bg-void transition-transform hover:scale-125" />
      </SliderPrimitive.Root>
    </div>
  )
}
