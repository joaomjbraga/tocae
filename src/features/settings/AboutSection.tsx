import { Info } from 'lucide-react'
import { useI18n } from '../../i18n'
import styles from './AboutSection.module.css'
import pkg from '../../../package.json'

const AUTHOR = String(pkg.author ?? '')
const EMAIL = AUTHOR.match(/<([^>]+)>/)?.[1] ?? ''
const NAME = AUTHOR.replace(/<[^>]+>/, '').trim()

function AboutSection() {
  const { t } = useI18n()

  return (
    <section className={styles.about} aria-labelledby="about-title">
      <header className={styles.header}>
        <Info size={18} className={styles.headerIcon} aria-hidden="true" />
        <h2 id="about-title" className={styles.title}>
          {t('about.title')}
        </h2>
      </header>
      <div className={styles.identity}>
        <img
          className={styles.appIcon}
          src="./tocae.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <div>
          <h3 className={styles.appName}>Tocaê Reprodutor</h3>
          <p className={styles.description}>{t('about.description')}</p>
        </div>
      </div>

      <dl className={styles.info}>
        <div className={styles.row}>
          <dt>{t('about.version')}</dt>
          <dd>{pkg.version}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('about.author')}</dt>
          <dd>{NAME}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('about.email')}</dt>
          <dd>{EMAIL}</dd>
        </div>
      </dl>
    </section>
  )
}

export default AboutSection
