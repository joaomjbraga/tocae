import type { LibrarySnapshot } from '@shared/library'
import type { MediaMetadata } from '@shared/media'
import type { PersistedPlaylist } from '@shared/playlist'
import type { AiToolDefinition } from './provider'

const METADATA_SEARCH_BATCH_SIZE = 8
const METADATA_SEARCH_FIELDS = ['title', 'artist', 'album', 'genre'] as const
type MetadataSearchField = (typeof METADATA_SEARCH_FIELDS)[number]

interface ReadOnlyToolOptions {
  getMediaMetadata?: (filePath: string) => Promise<MediaMetadata>
  favoritesEnabled?: boolean
  favoritePaths?: readonly string[]
  signal?: AbortSignal
}

export const AI_TOOL_DEFINITIONS: readonly AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_library',
      description:
        'Busca mídias pelo nome/caminho ou por metadados. Use title, artist, album e genre para pesquisar tags; filtros informados são combinados.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Texto opcional a procurar no nome ou caminho relativo.',
          },
          title: { type: 'string', description: 'Filtra pelo título da mídia.' },
          artist: { type: 'string', description: 'Filtra pelo artista.' },
          album: { type: 'string', description: 'Filtra pelo álbum.' },
          genre: { type: 'string', description: 'Filtra pelo gênero.' },
          type: { type: 'string', enum: ['audio', 'video', 'image'], description: 'Tipo opcional.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Máximo de resultados.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_favorites',
      description: 'Lista as mídias favoritas do usuário, se o acesso estiver autorizado nas configurações.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_listening_history',
      description: 'Consulta as reproduções locais recentes, somente se a coleta estiver autorizada.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
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
  {
    type: 'function',
    function: {
      name: 'search_library_semantic',
      description:
        'Busca mídias por significado usando o índice de embeddings da biblioteca.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Descrição ou conceito da mídia procurada.' },
          type: { type: 'string', enum: ['audio', 'video', 'image'], description: 'Tipo opcional.' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_player_state',
      description: 'Consulta se o reprodutor está reproduzindo e qual mídia está atual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_playlist',
      description:
        'Cria uma proposta de playlist baseada na biblioteca. Não altera a fila até o usuário confirmar.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Nome da proposta.' },
          query: { type: 'string', description: 'Tema, estilo, artista ou conceito.' },
          type: { type: 'string', enum: ['audio', 'video', 'image'] },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['title', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'player_play',
      description: 'Inicia a reprodução da mídia atual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'player_pause',
      description: 'Pausa a reprodução da mídia atual.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'player_toggle',
      description: 'Alterna entre reproduzir e pausar.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'player_next',
      description: 'Avança para a próxima mídia da fila.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'player_previous',
      description: 'Volta para a mídia anterior da fila.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

export async function executeReadOnlyTool(
  name: string,
  args: unknown,
  library: LibrarySnapshot,
  playlist: PersistedPlaylist | undefined,
  options: ReadOnlyToolOptions = {},
): Promise<unknown> {
  if (name === 'get_current_media') {
    if (!playlist) throw new Error('A fila atual não está disponível.')
    const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
    return { current: current ? { name: current.name } : null }
  }

  if (name === 'get_playlist') {
    if (!playlist) throw new Error('A fila atual não está disponível.')
    const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
    return {
      total: playlist.items.length,
      current: current ? { name: current.name, path: current.path } : null,
      items: playlist.items.map((item) => ({ name: item.name, path: item.path })),
    }
  }

  if (name === 'get_favorites') {
    if (!options.favoritesEnabled) {
      throw new Error('O acesso aos favoritos está desativado nas configurações do Teco.')
    }
    if (!isRecord(args)) throw new Error('O limite de favoritos não é válido.')
    const limit = readLimit(args, 20)
    const favoritePaths = new Set(options.favoritePaths ?? [])
    const matches = library.items
      .filter((item) => favoritePaths.has(item.path))
      .slice(0, limit)
      .map((item) => ({ name: item.name, type: item.type }))
    return {
      total: library.items.filter((item) => favoritePaths.has(item.path)).length,
      matches,
    }
  }

  if (name === 'search_library') {
    if (!isRecord(args)) throw new Error('Os filtros da biblioteca não são válidos.')
    const query = readSearchTerm(args, 'query')
    const metadataFilters = METADATA_SEARCH_FIELDS.flatMap((field) => {
      const value = readSearchTerm(args, field)
      return value ? [{ field, value }] : []
    })
    if (!query && metadataFilters.length === 0) {
      throw new Error('Informe um texto ou metadado para buscar na biblioteca.')
    }

    const type = args.type
    if (type !== undefined && type !== 'audio' && type !== 'video' && type !== 'image') {
      throw new Error('O tipo de mídia informado não é válido.')
    }
    const limit =
      typeof args.limit === 'number' && Number.isInteger(args.limit)
        ? Math.min(50, Math.max(1, args.limit))
        : 20

    const candidates = library.items.filter((item) => {
      if (type && item.type !== type) return false
      if (!query) return true
      return (
        normalizeSearchText(item.name).includes(query) ||
        normalizeSearchText(item.relativePath).includes(query)
      )
    })

    if (metadataFilters.length === 0) {
      return {
        total: library.items.length,
        matches: candidates.slice(0, limit).map((item) => ({
          name: item.name,
          path: item.path,
          relativePath: item.relativePath,
          type: item.type,
        })),
      }
    }

    if (!options.getMediaMetadata) {
      throw new Error('A busca por metadados não está disponível.')
    }

    const getMediaMetadata = options.getMediaMetadata
    const matches: Array<{
      name: string
      path: string
      relativePath: string
      type: string
      metadata: Record<string, string | string[]>
    }> = []

    for (
      let start = 0;
      start < candidates.length && matches.length < limit;
      start += METADATA_SEARCH_BATCH_SIZE
    ) {
      throwIfAborted(options.signal)
      const batch = candidates.slice(start, start + METADATA_SEARCH_BATCH_SIZE)
      const inspected = await Promise.all(
        batch.map(async (item) => ({
          item,
          metadata: await getMediaMetadata(item.path),
        })),
      )
      throwIfAborted(options.signal)

      for (const { item, metadata } of inspected) {
        if (
          !metadataFilters.every(({ field, value }) =>
            metadataFieldMatches(field, value, item.name, metadata),
          )
        ) {
          continue
        }

        const taggedMetadata: Record<string, string | string[]> = {}
        if (metadata.title) taggedMetadata.title = metadata.title
        if (metadata.artist) taggedMetadata.artist = metadata.artist
        if (metadata.album) taggedMetadata.album = metadata.album
        if (metadata.genres?.length) taggedMetadata.genres = metadata.genres

        matches.push({
          name: item.name,
          path: item.path,
          relativePath: item.relativePath,
          type: item.type,
          metadata: taggedMetadata,
        })
        if (matches.length >= limit) break
      }
    }

    return { total: library.items.length, matches }
  }

  throw new Error(`Ferramenta não autorizada: ${name}`)
}

function readSearchTerm(
  args: Record<string, unknown>,
  field: 'query' | MetadataSearchField,
): string {
  const value = args[field]
  if (value === undefined) return ''
  if (typeof value !== 'string') throw new Error(`O filtro "${field}" precisa ser um texto.`)
  return normalizeSearchText(value)
}

function metadataFieldMatches(
  field: MetadataSearchField,
  query: string,
  fileName: string,
  metadata: MediaMetadata,
): boolean {
  if (field === 'title') {
    return normalizeSearchText(metadata.title ?? fileName).includes(query)
  }
  if (field === 'artist') return matchesSearchText(metadata.artist, query)
  if (field === 'album') return matchesSearchText(metadata.album, query)
  return metadata.genres?.some((genre) => normalizeSearchText(genre).includes(query)) ?? false
}

function matchesSearchText(value: string | undefined, query: string): boolean {
  return value ? normalizeSearchText(value).includes(query) : false
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
}

function readLimit(args: Record<string, unknown>, maximum = 50): number {
  return typeof args.limit === 'number' && Number.isInteger(args.limit)
    ? Math.min(maximum, Math.max(1, args.limit))
    : 20
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
