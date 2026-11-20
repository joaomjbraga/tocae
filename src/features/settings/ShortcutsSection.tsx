import { useI18n } from '../../i18n'
import styles from './ShortcutsSection.module.css'

type Shortcut = {
  id: string
  action: string
  /** Cada item é uma combinação; várias combinações são alternativas. */
  combos: string[][]
}

function ShortcutsSection() {
  const { t } = useI18n()

  const shortcuts: Shortcut[] = [
    { id: 'openVideo', action: t('shortcuts.openVideo'), combos: [['Ctrl', 'O']] },
    {
      id: 'openFolder',
      action: t('shortcuts.openFolder'),
      combos: [['Ctrl', 'Shift', 'O']],
    },
    {
      id: 'playPause',
      action: t('shortcuts.playPause'),
      combos: [[t('shortcuts.key.space')]],
    },
    { id: 'fullscreen', action: t('shortcuts.fullscreen'), combos: [['F']] },
    { id: 'mute', action: t('shortcuts.mute'), combos: [['M']] },
    { id: 'zoomIn', action: t('shortcuts.zoomIn'), combos: [['+'], ['=']] },
    { id: 'zoomOut', action: t('shortcuts.zoomOut'), combos: [['-'], ['_']] },
    { id: 'next', action: t('shortcuts.next'), combos: [['N']] },
    { id: 'previous', action: t('shortcuts.previous'), combos: [['P']] },
    { id: 'toggleList', action: t('shortcuts.toggleList'), combos: [['L']] },
    {
      id: 'move',
      action: t('shortcuts.move'),
      combos: [
        ['Alt', '↑'],
        ['Alt', '↓'],
      ],
    },
  ]

  return (
    <section className={styles.shortcuts} aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className={styles.title}>
        {t('shortcuts.title')}
      </h2>

      <ul className={styles.list}>
        {shortcuts.map(({ id, action, combos }) => (
          <li key={id} className={styles.row}>
            <span className={styles.action}>{action}</span>

            <span className={styles.keys}>
              {combos.map((combo, comboIndex) => (
                <span key={combo.join('+')} className={styles.combo}>
                  {comboIndex > 0 && (
                    <span className={styles.separator} aria-hidden="true">
                      /
                    </span>
                  )}
                  {combo.map((key) => (
                    <kbd key={key} className={styles.key}>
                      {key}
                    </kbd>
                  ))}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ShortcutsSection