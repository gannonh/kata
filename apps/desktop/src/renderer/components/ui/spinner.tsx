import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ className, strokeWidth, ...props }: React.ComponentProps<"svg">) {
  const normalizedStrokeWidth =
    typeof strokeWidth === "number"
      ? strokeWidth
      : typeof strokeWidth === "string"
        ? Number.parseFloat(strokeWidth) || 2
        : 2

  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={normalizedStrokeWidth}
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
