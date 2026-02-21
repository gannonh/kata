declare global {
  interface Window {
    kata?: {
      openExternalUrl?: (url: string) => Promise<boolean>
    }
  }
}

export {}
