import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({
  className,
  strokeWidth,
  role,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<"svg">) {
  const parsedStrokeWidth =
    typeof strokeWidth === "string" ? Number.parseFloat(strokeWidth) : strokeWidth
  const normalizedStrokeWidth =
    typeof parsedStrokeWidth === "number" && Number.isFinite(parsedStrokeWidth)
      ? parsedStrokeWidth
      : 2

  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={normalizedStrokeWidth}
      role={role}
      aria-label={ariaLabel}
      aria-hidden={role == null && ariaLabel == null ? true : undefined}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
