import type { LibrarySnapshot } from '@shared/library'
import type { PersistedPlaylist } from '@shared/playlist'
import type { AiToolDefinition } from './provider'

export const AI_TOOL_DEFINITIONS: readonly AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_library',
      description: 'Busca mídias na biblioteca local por nome ou caminho relativo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto a procurar no nome ou caminho relativo.' },
          type: { type: 'string', enum: ['audio', 'video', 'image'], description: 'Tipo opcional.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Máximo de resultados.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_playlist',
      description: 'Consulta os itens da fila atual e o item em reprodução.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_media',
      description: 'Consulta o item atual da fila, sem executar ações no player.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export function executeReadOnlyTool(
  name: string,
  args: unknown,
  library: LibrarySnapshot,
  playlist: PersistedPlaylist,
): unknown {
  if (name === 'get_current_media') {
    const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
    return { current: current ? { name: current.name } : null }
  }

  if (name === 'get_playlist') {
    const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
    return {
      total: playlist.items.length,
      current: current ? { name: current.name, path: current.path } : null,
      items: playlist.items.map((item) => ({ name: item.name, path: item.path })),
    }
  }

  if (name === 'search_library') {
    if (!isRecord(args) || typeof args.query !== 'string') {
      throw new Error('A busca da biblioteca exige uma consulta de texto.')
    }
    const query = args.query.trim().toLowerCase()
    const type = args.type
    const limit =
      typeof args.limit === 'number' && Number.isInteger(args.limit)
        ? Math.min(50, Math.max(1, args.limit))
        : 20

    return {
      total: library.items.length,
      matches: library.items
        .filter((item) => {
          if (type && item.type !== type) return false
          return (
            item.name.toLowerCase().includes(query) ||
            item.relativePath.toLowerCase().includes(query)
          )
        })
        .slice(0, limit)
        .map((item) => ({
          name: item.name,
          path: item.path,
          relativePath: item.relativePath,
          type: item.type,
        })),
    }
  }

  throw new Error(`Ferramenta não autorizada: ${name}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
