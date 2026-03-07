import iconSvg from "@/assets/kata_mark.svg"

interface KataSymbolProps {
  className?: string
  size?: number
}

/**
 * Kata symbol - the app icon mark
 * Use className for styling, or size prop for explicit dimensions
 */
export function KataSymbol({ className, size }: KataSymbolProps) {
  return (
    <img
      src={iconSvg}
      alt="Kata"
      width={size}
      height={size}
      className={className}
    />
  )
}
