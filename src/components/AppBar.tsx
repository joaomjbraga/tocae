import { CirclePlay, File, FolderOpen, House, Music2, Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

export type AppPage = 'library' | 'player' | 'assistant' | 'settings' | 'youtube-music'

type AppBarProps = {
  activePage: AppPage
  onOpenMedia: () => void
  onOpenMediaFolder: () => void
  onOpenLibrary: () => void
  onOpenPlayer: () => void
  onOpenYouTubeMusic: () => void
  onOpenAssistant: () => void
  onOpenSettings: () => void
}

function AppBar({
  activePage,
  onOpenMedia,
  onOpenMediaFolder,
  onOpenLibrary,
  onOpenPlayer,
  onOpenYouTubeMusic,
  onOpenAssistant,
  onOpenSettings,
}: AppBarProps) {
  const { t } = useI18n()

  return (
    <aside className={styles.appBar} aria-label={t('appbar.navigation')}>
      <button
        type="button"
        className={styles.button}
        onClick={onOpenMedia}
        aria-label={t('appbar.openMediaFile')}
      >
        <span className={styles.icon} aria-hidden="true">
          <File size={16} />
        </span>
        <span className={styles.label}>{t('appbar.openMediaFile')}</span>
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onOpenMediaFolder}
        aria-label={t('appbar.openMediaFolder')}
      >
        <span className={styles.icon} aria-hidden="true">
          <FolderOpen size={16} />
        </span>
        <span className={styles.label}>{t('appbar.openMediaFolder')}</span>
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <span className={styles.spacer} />

      <button
        type="button"
        className={`${styles.button} ${activePage === 'library' ? styles.active : ''}`}
        onClick={onOpenLibrary}
        aria-label={t('library.home')}
        aria-pressed={activePage === 'library'}
      >
        <span className={styles.icon} aria-hidden="true">
          <House size={16} />
        </span>
        <span className={styles.label}>{t('library.home')}</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activePage === 'player' ? styles.active : ''}`}
        onClick={onOpenPlayer}
        aria-label={t('navigation.backToPlayer')}
        aria-pressed={activePage === 'player'}
      >
        <span className={styles.icon} aria-hidden="true">
          <CirclePlay size={16} />
        </span>
        <span className={styles.label}>{t('navigation.backToPlayer')}</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activePage === 'youtube-music' ? styles.active : ''}`}
        onClick={onOpenYouTubeMusic}
        aria-label={t('youtubeMusic.title')}
        aria-pressed={activePage === 'youtube-music'}
      >
        <span className={`${styles.icon} ${styles.youtubeIcon}`} aria-hidden="true">
          <Music2 size={13} />
        </span>
        <span className={styles.label}>{t('youtubeMusic.title')}</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activePage === 'assistant' ? styles.active : ''}`}
        onClick={onOpenAssistant}
        aria-label={t('assistant.title')}
        aria-pressed={activePage === 'assistant'}
      >
        <span className={styles.icon} aria-hidden="true">
          <img className={styles.tecoIcon} src="/images/teco.png" alt="" />
        </span>
        <span className={styles.label}>{t('assistant.title')}</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activePage === 'settings' ? styles.active : ''}`}
        onClick={onOpenSettings}
        aria-label={t('settings.title')}
        aria-pressed={activePage === 'settings'}
      >
        <span className={styles.icon} aria-hidden="true">
          <Settings size={16} />
        </span>
        <span className={styles.label}>{t('settings.title')}</span>
      </button>
    </aside>
  )
}

export default AppBar
