import { CirclePlay, File, FolderOpen, House, Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import styles from './AppBar.module.css'

type AppBarProps = {
  activePage: 'library' | 'player' | 'settings'
  onOpenMedia: () => void
  onOpenMediaFolder: () => void
  onOpenLibrary: () => void
  onOpenPlayer: () => void
  onOpenSettings: () => void
}

function AppBar({
  activePage,
  onOpenMedia,
  onOpenMediaFolder,
  onOpenLibrary,
  onOpenPlayer,
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
