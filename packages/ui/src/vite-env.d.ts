/// <reference types="vite/client" />

// Vite ?url imports resolve to string paths
declare module '*?url' {
  const src: string
  export default src
}
