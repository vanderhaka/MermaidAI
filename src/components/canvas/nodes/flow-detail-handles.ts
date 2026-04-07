import type { CSSProperties } from 'react'

export const FLOW_DETAIL_HANDLE_BASE_CLASS = '!h-[4px] !w-[4px] !border-0'

export const FLOW_DETAIL_HANDLE_COLOR = {
  success: '!bg-green-500',
  warning: '!bg-orange-400',
  neutral: '!bg-purple-400',
} as const

export const FLOW_DETAIL_HANDLE_POSITION: Record<
  'top' | 'bottom' | 'left' | 'right',
  CSSProperties
> = {
  top: { left: '50%', top: 0, transform: 'translate(-50%, -50%)' },
  bottom: { left: '50%', bottom: 0, transform: 'translate(-50%, 50%)' },
  left: { left: 0, top: '50%', transform: 'translate(-50%, -50%)' },
  right: { right: 0, top: '50%', transform: 'translate(50%, -50%)' },
}
