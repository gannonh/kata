import type { SessionMeta } from '@/atoms/sessions'

export function bubbleUnreadToParent({
  parent,
  children,
}: {
  parent: SessionMeta
  children: SessionMeta[]
}): { parentHasUnread: boolean } {
  return {
    parentHasUnread: parent.hasUnread === true || children.some(child => child.hasUnread === true),
  }
}
