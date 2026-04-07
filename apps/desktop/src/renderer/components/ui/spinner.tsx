import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ className, announceLabel }: { className?: string; announceLabel?: string }) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      className={cn("size-4 animate-spin", className)}
      {...(announceLabel
        ? { role: "status" as const, "aria-label": announceLabel }
        : { "aria-hidden": true as const })}
    />
  )
}

export { Spinner }
