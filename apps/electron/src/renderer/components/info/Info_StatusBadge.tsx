/**
 * Info_StatusBadge
 *
 * Status badge for permission states using Info_Badge.
 */

import * as React from 'react'
import { Info_Badge, type BadgeColor } from './Info_Badge'

type PermissionStatus = 'allowed' | 'blocked' | 'requires-permission'

const statusConfig: Record<PermissionStatus, { label: string; color: BadgeColor }> = {
  allowed: { label: 'Allowed', color: 'success' },
  blocked: { label: 'Blocked', color: 'destructive' },
  'requires-permission': { label: 'Ask', color: 'warning' },
}

export interface Info_StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Status type */
  status?: PermissionStatus | null
  /** Override the default label */
  label?: string
}

export function Info_StatusBadge({
  status,
  label,
  ...props
}: Info_StatusBadgeProps) {
  const key: PermissionStatus = status ?? 'allowed'
  const config: { label: string; color: BadgeColor } = statusConfig[key]
  const displayLabel = label ?? config.label

  return (
    <Info_Badge {...props} color={config.color}>
      {displayLabel}
    </Info_Badge>
  )
}
