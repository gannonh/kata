interface KataLogoProps {
  className?: string
}

/**
 * Kata logo - text-based wordmark
 * Apply text-accent class to get the brand color
 */
export function KataLogo({ className }: KataLogoProps) {
  return (
    <svg
      viewBox="0 0 200 50"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="38"
        fontFamily="ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace"
        fontSize="40"
        fontWeight="700"
        letterSpacing="0.05em"
        fill="currentColor"
      >
        KATA
      </text>
    </svg>
  )
}
