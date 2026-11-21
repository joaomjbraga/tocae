export function isEditableTextTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as EventTarget & {
    tagName?: string
    isContentEditable?: boolean
    getAttribute?: (name: string) => string | null
  }
  return (
    element.tagName === 'TEXTAREA' ||
    element.isContentEditable === true ||
    element.getAttribute?.('role') === 'textbox'
  )
}
