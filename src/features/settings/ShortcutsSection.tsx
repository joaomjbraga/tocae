import { Keyboard } from 'lucide-react'
import { useI18n } from '../../i18n'
import styles from './ShortcutsSection.module.css'

function ShortcutsSection() {
  const { t } = useI18n()

  const shortcuts = [
    { key: 'Ctrl+O', action: t('shortcuts.openVideo') },
    { key: 'Ctrl+Shift+O', action: t('shortcuts.openFolder') },
    { key: t('shortcuts.key.space'), action: t('shortcuts.playPause') },
    { key: 'F', action: t('shortcuts.fullscreen') },
    { key: 'M', action: t('shortcuts.mute') },
    { key: '+ / =', action: t('shortcuts.zoomIn') },
    { key: '- / _', action: t('shortcuts.zoomOut') },
    { key: 'N', action: t('shortcuts.next') },
    { key: 'P', action: t('shortcuts.previous') },
    { key: 'L', action: t('shortcuts.toggleList') },
    { key: 'Alt+↑ / Alt+↓', action: t('shortcuts.move') },
  ]

  return (
    <section className={styles.shortcuts} aria-labelledby="shortcuts-title">
      <header className={styles.header}>
        <Keyboard size={20} className={styles.headerIcon} aria-hidden="true" />
        <h2 id="shortcuts-title" className={styles.title}>
          {t('shortcuts.title')}
        </h2>
      </header>

      <ul className={styles.list}>
        {shortcuts.map(({ key, action }) => (
          <li key={action} className={styles.row}>
            <kbd className={styles.key}>{key}</kbd>
            <span className={styles.action}>{action}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ShortcutsSection
