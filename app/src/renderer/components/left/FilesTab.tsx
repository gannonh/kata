import { useMemo, useState } from 'react'

import type { MockFileNode } from '../../mock/files'
import { FileTreeNode } from './FileTreeNode'
import { SearchInput } from '../shared/SearchInput'

type FilesTabProps = {
  files: MockFileNode[]
}

function filterNodes(nodes: MockFileNode[], query: string): MockFileNode[] {
  if (!query) {
    return nodes
  }

  const loweredQuery = query.toLowerCase()

  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return node.name.toLowerCase().includes(loweredQuery) ? [node] : []
    }

    const filteredChildren = filterNodes(node.children ?? [], query)
    const nameMatches = node.name.toLowerCase().includes(loweredQuery)

    if (!nameMatches && filteredChildren.length === 0) {
      return []
    }

    return [
      {
        ...node,
        children: filteredChildren
      }
    ]
  })
}

export function FilesTab({ files }: FilesTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const filteredFiles = useMemo(
    () => filterNodes(files, searchQuery.trim()),
    [files, searchQuery]
  )

  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">
        Files
      </h2>
      <SearchInput
        className="mt-4"
        ariaLabel="Search files"
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search files..."
      />
      <ul className="mt-4 grid gap-1">
        {filteredFiles.map((node) => (
          <FileTreeNode
            key={node.id}
            node={node}
            expandedPaths={expandedPaths}
            forceExpanded={Boolean(searchQuery.trim())}
            onToggle={(path) => {
              setExpandedPaths((current) => {
                const next = new Set(current)
                if (next.has(path)) {
                  next.delete(path)
                } else {
                  next.add(path)
                }
                return next
              })
            }}
          />
        ))}
      </ul>
    </section>
  )
}
