import type { KataApi } from './index'

declare global {
  interface Window {
    kata?: KataApi
  }
}

export {}
