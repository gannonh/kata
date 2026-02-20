import type { MockFileNode } from '../../mock/files'

type FileTreeNodeProps = {
  node: MockFileNode
  depth?: number
  expandedPaths: Set<string>
  onToggle: (path: string) => void
  forceExpanded?: boolean
}

export function FileTreeNode({
  node,
  depth = 0,
  expandedPaths,
  onToggle,
  forceExpanded = false
}: FileTreeNodeProps) {
  const hasChildren = node.type === 'directory' && Array.isArray(node.children) && node.children.length > 0
  const isExpanded = forceExpanded || expandedPaths.has(node.path)

  if (node.type === 'file') {
    return (
      <li className="font-body text-sm text-[color:var(--text-secondary)]">
        <span style={{ paddingLeft: `${depth * 12}px` }}>{node.name}</span>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        aria-label={`Toggle ${node.path}`}
        className="inline-flex items-center gap-2 font-body text-sm text-[color:var(--text-primary)]"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <span>{isExpanded ? '▾' : '▸'}</span>
        <span>{node.name}</span>
      </button>
      {hasChildren && isExpanded ? (
        <ul className="mt-1 grid gap-1">
          {node.children?.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              forceExpanded={forceExpanded}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
