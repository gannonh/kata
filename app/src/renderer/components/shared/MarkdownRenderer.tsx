import { Fragment } from 'react'

import { cn } from '../../lib/cn'

type MarkdownRendererProps = {
  content: string
  className?: string
}

type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'paragraph'; text: string }

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2]
      })
      index += 1
      continue
    }

    const codeMatch = /^```(.*)$/.exec(trimmed)
    if (codeMatch) {
      const language = codeMatch[1]?.trim() ?? ''
      const codeLines: string[] = []
      index += 1

      while (index < lines.length) {
        const codeLine = lines[index] ?? ''
        if (codeLine.trim() === '```') {
          index += 1
          break
        }
        codeLines.push(codeLine)
        index += 1
      }

      blocks.push({
        kind: 'code',
        language,
        code: codeLines.join('\n')
      })
      continue
    }

    if (/^-\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length) {
        const itemLine = (lines[index] ?? '').trim()
        const itemMatch = /^-\s+(.+)$/.exec(itemLine)
        if (!itemMatch) {
          break
        }
        items.push(itemMatch[1])
        index += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }

    const paragraphLines: string[] = [trimmed]
    index += 1

    while (index < lines.length) {
      const paragraphLine = (lines[index] ?? '').trim()
      if (!paragraphLine || /^(#{1,6})\s+/.test(paragraphLine) || /^```/.test(paragraphLine) || /^-\s+/.test(paragraphLine)) {
        break
      }
      paragraphLines.push(paragraphLine)
      index += 1
    }

    blocks.push({
      kind: 'paragraph',
      text: paragraphLines.join(' ')
    })
  }

  return blocks
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const blocks = parseMarkdown(content)

  return (
    <div className={cn('space-y-3 font-body text-sm text-[color:var(--text-secondary)]', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-2xl'
              : block.level === 2
                ? 'text-xl'
                : 'text-lg'
          const HeadingTag = `h${block.level}` as const

          return (
            <HeadingTag
              key={`heading-${index}`}
              className={cn('font-display uppercase tracking-[0.08em] text-[color:var(--text-primary)]', sizeClass)}
            >
              {block.text}
            </HeadingTag>
          )
        }

        if (block.kind === 'list') {
          return (
            <ul
              key={`list-${index}`}
              className="list-inside list-disc space-y-1"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`list-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          )
        }

        if (block.kind === 'code') {
          return (
            <pre
              key={`code-${index}`}
              className="overflow-x-auto rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-elevated)] p-3 font-mono text-xs text-[color:var(--text-primary)]"
            >
              <code className={block.language ? `language-${block.language}` : undefined}>{block.code}</code>
            </pre>
          )
        }

        return <Fragment key={`paragraph-${index}`}>{block.text}</Fragment>
      })}
    </div>
  )
}
