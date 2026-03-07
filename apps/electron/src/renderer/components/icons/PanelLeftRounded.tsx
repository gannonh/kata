import type { SVGProps } from "react"

/**
 * Custom right sidebar close icon with rounded design
 * The arrow points left to indicate the close/collapse action.
 */
export function PanelLeftRounded(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15.0469 4C15.5349 9.35962 15.5349 14.6404 15.0469 20M8.5 14.1216C9.37939 13.6601 10.0083 13.0654 10.4944 12.2299C10.577 12.088 10.5771 11.9126 10.4945 11.7706C10.0086 10.9348 9.37968 10.3402 8.5 9.87894M3.5 11.5L3.5 12.5C3.5 16.2712 3.5 18.1569 4.67157 19.3284C5.84315 20.5 7.72876 20.5 11.5 20.5L12.5 20.5C16.2712 20.5 18.1569 20.5 19.3284 19.3284C20.5 18.1569 20.5 16.2712 20.5 12.5L20.5 11.5C20.5 7.72876 20.5 5.84315 19.3284 4.67157C18.1569 3.5 16.2712 3.5 12.5 3.5L11.5 3.5C7.72876 3.5 5.84315 3.5 4.67157 4.67157C3.5 5.84315 3.5 7.72876 3.5 11.5Z" />
    </svg>
  )
}
