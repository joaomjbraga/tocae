import { AI_LIMITS } from '../../shared/ai.ts'
import type { AiMessage } from '@shared/ai'

export { AI_LIMITS }

export function limitAiHistory(messages: readonly AiMessage[]): AiMessage[] {
  const retained = messages.slice(-AI_LIMITS.historyMessages)
  while (retained.length > 0 && historyBytes(retained) > AI_LIMITS.historyBytes) {
    const removeCount =
      retained[0].role === 'user' && retained[1]?.role === 'assistant' ? 2 : 1
    retained.splice(0, removeCount)
  }
  return retained
}

function historyBytes(messages: readonly AiMessage[]): number {
  return messages.reduce(
    (total, message) => total + Buffer.byteLength(JSON.stringify(message), 'utf8'),
    0,
  )
}
