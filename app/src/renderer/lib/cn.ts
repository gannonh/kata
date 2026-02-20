type ClassDictionary = Record<string, boolean | null | undefined>

type ClassInput =
  | string
  | number
  | null
  | undefined
  | boolean
  | ClassDictionary
  | ClassInput[]

function flatten(input: ClassInput, output: string[]): void {
  if (!input) {
    return
  }

  if (typeof input === 'string' || typeof input === 'number') {
    output.push(String(input))
    return
  }

  if (Array.isArray(input)) {
    for (const value of input) {
      flatten(value, output)
    }
    return
  }

  if (typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (value) {
        output.push(key)
      }
    }
  }
}

export function cn(...inputs: ClassInput[]): string {
  const output: string[] = []

  for (const input of inputs) {
    flatten(input, output)
  }

  return output.join(' ')
}
