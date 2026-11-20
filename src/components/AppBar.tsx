import { AudioLines, File, FolderOpen, Settings } from 'lucide-react'
import type { StreamingService } from '@shared/ipc'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

type AppBarProps = {
  activePage: 'player' | 'settings'
  activeStreamingService: StreamingService | null
  onOpenMedia: () => void
  onOpenMediaFolder: () => void
  onOpenStreamingService: (service: StreamingService) => void
  onOpenSettings: () => void
}

function AppBar({
  activePage,
  activeStreamingService,
  onOpenMedia,
  onOpenMediaFolder,
  onOpenStreamingService,
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

      <button
        type="button"
        className={`${styles.button} ${activeStreamingService === 'netflix' ? styles.active : ''}`}
        onClick={() => onOpenStreamingService('netflix')}
        aria-label={t('services.netflix')}
      >
        <span className={styles.icon} aria-hidden="true">
          <span className={styles.netflixMark}>N</span>
        </span>
        <span className={styles.label}>{t('services.netflix')}</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${activeStreamingService === 'spotify' ? styles.active : ''}`}
        onClick={() => onOpenStreamingService('spotify')}
        aria-label={t('services.spotify')}
      >
        <span className={styles.icon} aria-hidden="true">
          <AudioLines className={styles.spotifyMark} size={18} />
        </span>
        <span className={styles.label}>{t('services.spotify')}</span>
      </button>

      <span className={styles.separator} aria-hidden="true" />

      <span className={styles.spacer} />

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
