import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Send, Square, Trash2 } from 'lucide-react'
import type { AiMessage, AiStatus } from '@shared/ai'
import { useI18n } from '../../i18n'
import styles from './AssistantPage.module.css'

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
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.tocae.ai.getStatus()
      .then(setStatus)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : t('assistant.unknownError')))
  }, [t])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [status?.messages, status?.busy])

  useEffect(() => {
    return window.tocae.ai.onStreamChunk((chunk) => {
      setStreamingText((current) => current + chunk)
    })
  }, [])

  async function send(event: FormEvent) {
    event.preventDefault()
    const content = message.trim()
    if (!content || status?.busy) return
    setError(null)
    setMessage('')
    setStreamingText('')
    setStatus((current) => current ? { ...current, busy: true } : current)
    try {
      setStatus(await window.tocae.ai.sendMessage(content))
      setStreamingText('')
    } catch (reason) {
      setStreamingText('')
      setError(reason instanceof Error ? reason.message : t('assistant.unknownError'))
      try {
        setStatus(await window.tocae.ai.getStatus())
      } catch {
        // The send error remains the most useful message.
      }
    }
  }

  async function cancel() {
    setError(null)
    try {
      setStatus(await window.tocae.ai.cancel())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('assistant.unknownError'))
    }
  }

  async function clear() {
    setError(null)
    try {
      setStatus(await window.tocae.ai.clear())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('assistant.unknownError'))
    }
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
        {messages.length === 0 && (
          <div className={styles.empty}>
            <img className={styles.emptyAvatar} src="/images/teco.png" alt="" />
            <h2>{t('assistant.emptyTitle')}</h2>
            <p>{t('assistant.emptyDescription')}</p>
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

      <form className={styles.composer} onSubmit={send}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={status?.configured ? t('assistant.placeholder') : t('assistant.notConfigured')}
          aria-label={t('assistant.inputLabel')}
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
