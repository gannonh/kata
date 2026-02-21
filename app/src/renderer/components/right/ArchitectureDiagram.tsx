export function ArchitectureDiagram() {
  return (
    <figure className="rounded-lg border bg-card p-3">
      <svg
        viewBox="0 0 520 180"
        role="img"
        aria-label="Desktop shell architecture diagram"
        className="h-auto w-full"
      >
        <rect
          x="10"
          y="28"
          width="150"
          height="120"
          rx="14"
          fill="rgba(15, 23, 42, 0.45)"
          stroke="rgba(148, 163, 184, 0.45)"
        />
        <text
          x="85"
          y="95"
          textAnchor="middle"
          fill="#d1d5db"
          fontSize="14"
        >
          Renderer UI
        </text>

        <rect
          x="186"
          y="28"
          width="150"
          height="120"
          rx="14"
          fill="rgba(15, 23, 42, 0.45)"
          stroke="rgba(148, 163, 184, 0.45)"
        />
        <text
          x="261"
          y="95"
          textAnchor="middle"
          fill="#d1d5db"
          fontSize="14"
        >
          Preload Bridge
        </text>

        <rect
          x="362"
          y="28"
          width="150"
          height="120"
          rx="14"
          fill="rgba(15, 23, 42, 0.45)"
          stroke="rgba(148, 163, 184, 0.45)"
        />
        <text
          x="437"
          y="95"
          textAnchor="middle"
          fill="#d1d5db"
          fontSize="14"
        >
          Main Process
        </text>

        <line
          x1="160"
          y1="88"
          x2="186"
          y2="88"
          stroke="#9ca3af"
          strokeWidth="2"
        />
        <line
          x1="336"
          y1="88"
          x2="362"
          y2="88"
          stroke="#9ca3af"
          strokeWidth="2"
        />
      </svg>
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Mock architecture placeholder for renderer, preload, and main process boundaries.
      </figcaption>
    </figure>
  )
}
