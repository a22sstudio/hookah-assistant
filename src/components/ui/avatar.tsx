"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

// Variant: "circle" (default for people) | "square" (for product/UI thumbnails)
function Avatar({
  className,
  variant = "circle",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  variant?: "circle" | "square"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-variant={variant}
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden border border-border",
        variant === "circle" ? "rounded-full" : "rounded-md",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
