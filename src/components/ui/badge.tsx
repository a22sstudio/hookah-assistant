import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-tight leading-none h-5 whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-base transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        // Default: muted bg, muted-fg text, no border accent
        default:
          "border-transparent bg-muted text-muted-foreground [a&]:hover:bg-muted/70",
        // Secondary: secondary bg
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        // Destructive: ember bg, white text
        destructive:
          "border-transparent bg-ember text-ember-foreground [a&]:hover:bg-ember/85 focus-visible:ring-ember/20",
        // Outline: 1px border-border, transparent bg
        outline:
          "border-border bg-transparent text-foreground [a&]:hover:bg-muted [a&]:hover:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
