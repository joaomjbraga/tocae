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
      <h2 id="about-title" className={styles.title}>
        {t('about.title')}
      </h2>

      <div className={styles.identity}>
        <img
          className={styles.appIcon}
          src="./tocae.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <h3 className={styles.appName}>Tocaê</h3>
        <p className={styles.version}>
          {t('about.version')} {pkg.version}
        </p>
        <p className={styles.description}>{t('about.description')}</p>
      </div>

      <dl className={styles.group}>
        <div className={styles.row}>
          <dt>{t('about.version')}</dt>
          <dd>{pkg.version}</dd>
        </div>
        {NAME && (
          <div className={styles.row}>
            <dt>{t('about.author')}</dt>
            <dd>{NAME}</dd>
          </div>
        )}
        {EMAIL && (
          <div className={styles.row}>
            <dt>{t('about.email')}</dt>
            <dd>
              <a className={styles.link} href={`mailto:${EMAIL}`}>
                {EMAIL}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}

export default AboutSection