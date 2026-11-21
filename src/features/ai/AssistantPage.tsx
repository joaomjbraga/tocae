import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { RefreshCw, Send, Square, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import { AI_LIMITS } from '@shared/ai'
import type {
  AiMessage,
  AiPlaylistProposal,
  AiRecommendation,
  AiRecommendationFeedback,
  AiStatus,
} from '@shared/ai'
import { MAX_SAVED_PLAYLIST_NAME_LENGTH } from '@shared/playlist'
import { useI18n } from '../../i18n'
import { readFavoritePaths } from '../library/favorites'
import styles from './AssistantPage.module.css'

function providerErrorMessage(reason: unknown): string {
  if (!(reason instanceof Error)) return ''
  return reason.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function Markdown({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let listItems: string[] = []

  function flushList() {
    if (listItems.length === 0) return
    nodes.push(
      <ul key={`list-${nodes.length}`}>
        {listItems.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}
      </ul>,
    )
    listItems = []
  }

  text.split('\n').forEach((line, index) => {
    if (/^[-*] /.test(line)) {
      listItems.push(line.replace(/^[-*] /, ''))
      return
    }
    flushList()
    if (/^### /.test(line)) {
      nodes.push(<h3 key={index}>{inlineMarkdown(line.slice(4))}</h3>)
    } else if (/^## /.test(line)) {
      nodes.push(<h2 key={index}>{inlineMarkdown(line.slice(3))}</h2>)
    } else if (/^# /.test(line)) {
      nodes.push(<h1 key={index}>{inlineMarkdown(line.slice(2))}</h1>)
    } else if (line.trim()) {
      nodes.push(<p key={index}>{inlineMarkdown(line)}</p>)
    }
  })
  flushList()
  return <div className={styles.markdown}>{nodes}</div>
}

function AssistantPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [playlistProposal, setPlaylistProposal] = useState<AiPlaylistProposal | null>(null)
  const [playlistName, setPlaylistName] = useState('')
  const [savingProposal, setSavingProposal] = useState(false)
  const [proposalSaved, setProposalSaved] = useState(false)
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [feedbackPath, setFeedbackPath] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const providerName = status
    ? {
        openai: t('settings.aiProviderOpenAI'),
        gemini: t('settings.aiProviderGemini'),
        ollama: t('settings.aiProviderOllama'),
        'openai-compatible': t('settings.aiProviderCompatible'),
      }[status.provider.provider]
    : ''
  const endpoint = status?.provider.provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com'
    : status?.provider.baseUrl ?? ''

  const refreshRecommendations = useCallback(async () => {
    if (!status?.dataPreferences.localRecommendations) {
      setRecommendations([])
      setRecommendationError(null)
      return
    }
    setRecommendationsLoading(true)
    setRecommendationError(null)
    try {
      setRecommendations(
        await window.tocae.ai.getRecommendations([...readFavoritePaths()]),
      )
    } catch (reason) {
      setRecommendationError(
        providerErrorMessage(reason) || t('assistant.unknownError'),
      )
    } finally {
      setRecommendationsLoading(false)
    }
  }, [status?.dataPreferences.localRecommendations, t])

  useEffect(() => {
    void window.tocae.ai.getStatus()
      .then(setStatus)
      .catch((reason: unknown) => setError(providerErrorMessage(reason) || t('assistant.unknownError')))
  }, [t])

  useEffect(() => {
    void refreshRecommendations()
  }, [refreshRecommendations])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [status?.messages, status?.busy])

  useEffect(() => {
    return window.tocae.ai.onStreamChunk((chunk) => {
      setStreamingText((current) => current + chunk)
    })
  }, [])

  useEffect(() => {
    void window.tocae.ai.getPlaylistProposal().then(setPlaylistProposal)
    return window.tocae.ai.onPlaylistProposalChanged(setPlaylistProposal)
  }, [])

  useEffect(() => {
    setPlaylistName(playlistProposal?.title.slice(0, MAX_SAVED_PLAYLIST_NAME_LENGTH) ?? '')
    setProposalSaved(false)
  }, [playlistProposal?.id])

  async function applyProposal() {
    setError(null)
    try {
      await window.tocae.ai.applyPlaylistProposal()
    } catch (reason) {
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
    }
  }

  async function clearProposal() {
    try {
      await window.tocae.ai.clearPlaylistProposal()
    } catch (reason) {
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
    }
  }

  async function saveProposal(event: FormEvent) {
    event.preventDefault()
    const title = playlistName.trim()
    if (!playlistProposal || !title || playlistProposal.items.length === 0 || savingProposal) return
    setError(null)
    setSavingProposal(true)
    try {
      await window.tocae.savedPlaylists.create(
        title,
        playlistProposal.items.map((item) => ({
          id: crypto.randomUUID(),
          path: item.path,
          name: item.name,
        })),
      )
      setProposalSaved(true)
    } catch (reason) {
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
    } finally {
      setSavingProposal(false)
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = message.trim()
    if (!content || status?.busy) return
    if (new TextEncoder().encode(content).byteLength > AI_LIMITS.userMessageBytes) {
      setError(t('assistant.messageTooLong', {
        maxKiB: AI_LIMITS.userMessageBytes / 1024,
      }))
      return
    }
    setError(null)
    setMessage('')
    setStreamingText('')
    setStatus((current) => current ? { ...current, busy: true } : current)
    try {
      const favoritePaths = status?.dataPreferences.allowFavorites
        ? [...readFavoritePaths()]
        : []
      setStatus(await window.tocae.ai.sendMessage(content, favoritePaths))
      setStreamingText('')
    } catch (reason) {
      setStreamingText('')
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
      try {
        setStatus(await window.tocae.ai.getStatus())
      } catch {
        // The send error remains the most useful message.
      }
    }
  }

  function choosePrompt(prompt: string) {
    setMessage(prompt)
    textareaRef.current?.focus()
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  async function cancel() {
    setError(null)
    try {
      setStatus(await window.tocae.ai.cancel())
    } catch (reason) {
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
    }
  }

  async function clear() {
    setError(null)
    try {
      setStatus(await window.tocae.ai.clear())
    } catch (reason) {
      setError(providerErrorMessage(reason) || t('assistant.unknownError'))
    }
  }

  async function rateRecommendation(
    recommendation: AiRecommendation,
    feedback: AiRecommendationFeedback,
  ) {
    setFeedbackPath(recommendation.path)
    setRecommendationError(null)
    try {
      await window.tocae.ai.setRecommendationFeedback(recommendation.path, feedback)
      await refreshRecommendations()
    } catch (reason) {
      setRecommendationError(
        providerErrorMessage(reason) || t('assistant.unknownError'),
      )
    } finally {
      setFeedbackPath(null)
    }
  }

  function recommendationReason(recommendation: AiRecommendation): string {
    const key = {
      artist: 'assistant.recommendationReasonArtist',
      album: 'assistant.recommendationReasonAlbum',
      genre: 'assistant.recommendationReasonGenre',
    } as const
    return t(key[recommendation.reason.kind], {
      value: recommendation.reason.value,
      basedOn: recommendation.reason.basedOn,
      signal: t(
        recommendation.reason.signal === 'favorite'
          ? 'assistant.recommendationFavoriteSignal'
          : 'assistant.recommendationLikedSignal',
      ),
    })
  }

  const messages = status?.messages ?? []
  return (
    <section className={styles.page} aria-labelledby="assistant-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <img className={styles.avatar} src="/images/teco.png" alt="" />
          <div>
            <h1 id="assistant-title" className={styles.title}>{t('assistant.title')}</h1>
            <p className={styles.description}>{t('assistant.description')}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button type="button" className={styles.clearButton} onClick={() => void clear()} disabled={status?.busy}>
            <Trash2 size={14} aria-hidden="true" />
            {t('assistant.clear')}
          </button>
        )}
      </header>

      <div className={styles.conversation} aria-live="polite">
        {status?.dataPreferences.localRecommendations && (
          <section className={styles.recommendations} aria-labelledby="recommendations-title">
            <header className={styles.recommendationsHeader}>
              <div>
                <h2 id="recommendations-title">{t('assistant.recommendationsTitle')}</h2>
                <p>{t('assistant.recommendationsDescription')}</p>
              </div>
              <button
                type="button"
                className={styles.refreshRecommendations}
                onClick={() => void refreshRecommendations()}
                disabled={recommendationsLoading}
                aria-label={t('assistant.recommendationsRefresh')}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </header>
            {recommendationError && (
              <p className={styles.recommendationError} role="alert">{recommendationError}</p>
            )}
            {recommendationsLoading ? (
              <p className={styles.recommendationEmpty} role="status">
                {t('assistant.recommendationsLoading')}
              </p>
            ) : recommendations.length === 0 ? (
              <p className={styles.recommendationEmpty}>{t('assistant.recommendationsEmpty')}</p>
            ) : (
              <ul className={styles.recommendationList}>
                {recommendations.map((recommendation) => (
                  <li key={recommendation.path} className={styles.recommendationItem}>
                    <div className={styles.recommendationCopy}>
                      <strong>{recommendation.title}</strong>
                      <span>{recommendation.artist || recommendation.name}</span>
                      <small>{recommendationReason(recommendation)}</small>
                    </div>
                    <div className={styles.recommendationFeedback}>
                      <button
                        type="button"
                        onClick={() => void rateRecommendation(recommendation, 'like')}
                        disabled={feedbackPath !== null}
                        aria-label={t('assistant.recommendationLike', { name: recommendation.title })}
                        title={t('assistant.recommendationLike', { name: recommendation.title })}
                      >
                        <ThumbsUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void rateRecommendation(recommendation, 'dislike')}
                        disabled={feedbackPath !== null}
                        aria-label={t('assistant.recommendationDislike', { name: recommendation.title })}
                        title={t('assistant.recommendationDislike', { name: recommendation.title })}
                      >
                        <ThumbsDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {messages.length === 0 && (
          <div className={styles.empty}>
            <img className={styles.emptyAvatar} src="/images/teco.png" alt="" />
            <h2>{t('assistant.emptyTitle')}</h2>
            <p>{t('assistant.emptyDescription')}</p>
            <div className={styles.promptGrid} role="group" aria-label={t('assistant.suggestions')}>
              {[
                t('assistant.promptCurrent'),
                t('assistant.promptQueue'),
                t('assistant.promptLibrary'),
                t('assistant.promptHelp'),
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className={styles.promptButton}
                  onClick={() => choosePrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((item: AiMessage) => (
          <article
            key={item.id}
            className={`${styles.message} ${item.role === 'user' ? styles.user : styles.assistant}`}
          >
            <span className={styles.role}>{item.role === 'user' ? t('assistant.you') : t('assistant.title')}</span>
            {item.role === 'assistant' ? <Markdown text={item.content} /> : <p>{item.content}</p>}
          </article>
        ))}
        {status?.busy && streamingText && (
          <article className={`${styles.message} ${styles.assistant}`}>
            <Markdown text={streamingText} />
          </article>
        )}
        {status?.busy && (
          <div className={styles.processing} role="status">
            <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
            {t('assistant.processing')}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {playlistProposal && (
        <section className={styles.playlistProposal} aria-label={t('assistant.playlistProposal')}>
          <div className={styles.proposalCopy}>
            <strong>{playlistProposal.title}</strong>
            <span>{t('assistant.playlistProposalCount', { count: playlistProposal.items.length })}</span>
          </div>
          <form className={styles.proposalSaveForm} onSubmit={(event) => void saveProposal(event)}>
            <input
              value={playlistName}
              maxLength={MAX_SAVED_PLAYLIST_NAME_LENGTH}
              onChange={(event) => setPlaylistName(event.target.value)}
              aria-label={t('assistant.playlistSaveName')}
            />
            <button
              type="submit"
              className={styles.clearProposal}
              disabled={!playlistName.trim() || playlistProposal.items.length === 0 || savingProposal || proposalSaved}
            >
              {savingProposal
                ? t('assistant.playlistSaving')
                : proposalSaved
                  ? t('assistant.playlistSaved')
                  : t('assistant.playlistSave')}
            </button>
          </form>
          <div className={styles.proposalActions}>
            <button type="button" className={styles.applyProposal} onClick={() => void applyProposal()}>
              {t('assistant.playlistApply')}
            </button>
            <button type="button" className={styles.clearProposal} onClick={() => void clearProposal()}>
              {t('assistant.playlistDiscard')}
            </button>
          </div>
        </section>
      )}

      {status && (
        <>
          <p className={styles.privacyNotice} role="note">
            {t('assistant.privacyNotice', { provider: providerName, endpoint })}
          </p>
          <p className={styles.contextNotice} role="note">
            {t('assistant.contextNotice', {
              userMessageKiB: AI_LIMITS.userMessageBytes / 1024,
              contextKiB: AI_LIMITS.contextBytes / 1024,
              historyKiB: AI_LIMITS.historyBytes / 1024,
              outputTokens: AI_LIMITS.outputTokens,
            })}
          </p>
        </>
      )}

      <form className={styles.composer} onSubmit={send}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={status?.configured ? t('assistant.placeholder') : t('assistant.notConfigured')}
          aria-label={t('assistant.inputLabel')}
          aria-keyshortcuts="Enter"
          rows={2}
          disabled={status?.busy}
        />
        {status?.busy ? (
          <button type="button" className={styles.sendButton} onClick={() => void cancel()} aria-label={t('assistant.cancel')}>
            <Square size={15} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className={styles.sendButton} aria-label={t('assistant.send')} disabled={!message.trim() || !status?.configured}>
            <Send size={16} aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  )
}

export default AssistantPage
