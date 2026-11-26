import { appendFile, readdir, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const releaseRoot = path.resolve(projectRoot, process.env.TOCAE_RELEASE_DIR ?? 'release')
const MAX_INSTALLER_SIZE = 250 * 1024 * 1024
const asarCli = path.join(projectRoot, 'node_modules', '@electron', 'asar', 'bin', 'asar.js')

async function findReleaseFiles(
  directory,
  found = { archives: [], installers: [], updateMetadata: [], blockmaps: [] },
) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return found
    }
    throw error
  }

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'app.asar.unpacked') await findReleaseFiles(filePath, found)
      continue
    }
    if (!entry.isFile()) continue

    if (entry.name === 'app.asar') found.archives.push(filePath)
    if (
      path.dirname(filePath) === releaseRoot &&
      /\.(deb|rpm|exe)$/i.test(entry.name)
    ) {
      found.installers.push(filePath)
    }
    if (entry.name === 'latest.yml') found.updateMetadata.push(filePath)
    if (/\.blockmap$/i.test(entry.name)) found.blockmaps.push(filePath)
  }
  return found
}

function listArchive(archivePath) {
  try {
    return execFileSync(process.execPath, [asarCli, 'list', archivePath], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    const details =
      error && typeof error === 'object' && 'stderr' in error
        ? String(error.stderr).trim()
        : String(error)
    throw new Error(`Could not list ASAR "${archivePath}": ${details}`)
  }
}

function forbiddenArchivePath(archivePath) {
  const normalized = archivePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = normalized.split('/')
  const basename = segments.at(-1) ?? ''
  const isDependency = segments.includes('node_modules')

  if (basename.toLowerCase() === '.ds_store') return 'Finder metadata'
  if (/\.(?:map|ts)$/i.test(basename)) return 'source map or TypeScript source'
  if (/^\.env(?:\..*)?$/i.test(basename)) return 'environment file'
  if (segments.some((segment) => segment.toLowerCase() === '.git')) return 'Git metadata'

  // Some runtime dependencies load JavaScript from their own src/ directories.
  if (!isDependency && segments.some((segment) => segment.toLowerCase() === 'src')) {
    return 'application source directory'
  }
  return null
}

function formatBytes(bytes) {
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toFixed(1)} MiB`
}

async function main() {
  const { archives, installers, updateMetadata, blockmaps } =
    await findReleaseFiles(releaseRoot)
  if (archives.length === 0) {
    throw new Error(`No app.asar found under "${releaseRoot}". Build the installer first.`)
  }
  if (installers.length === 0) {
    throw new Error(`No .deb, .rpm, or .exe installer found under "${releaseRoot}".`)
  }
  if (installers.some((installer) => /\.exe$/i.test(installer))) {
    if (updateMetadata.length === 0) {
      throw new Error('Windows installer is missing the electron-updater latest.yml metadata.')
    }
    if (blockmaps.length === 0) {
      throw new Error('Windows installer is missing electron-updater blockmap files.')
    }
  }

  let failureCount = 0
  for (const archive of archives) {
    const entries = listArchive(archive)
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
    const violations = entries.flatMap((entry) => {
      const reason = forbiddenArchivePath(entry)
      return reason ? [{ entry, reason }] : []
    })

    console.log(`ASAR: ${path.relative(releaseRoot, archive)} (${entries.length} entries)`)
    if (violations.length > 0) {
      failureCount += violations.length
      for (const { entry, reason } of violations.slice(0, 50)) {
        console.error(`Forbidden ${reason}: ${entry}`)
      }
      if (violations.length > 50) {
        console.error(`... ${violations.length - 50} additional prohibited entries omitted.`)
      }
    } else {
      console.log('  No prohibited source, environment, or Git files found.')
    }
  }

  const summaryRows = []
  for (const installer of installers.sort()) {
    const { size } = await stat(installer)
    const relativePath = path.relative(releaseRoot, installer)
    const sizeLabel = formatBytes(size)
    summaryRows.push(`| \`${relativePath}\` | ${sizeLabel} |`)
    console.log(`Installer: ${relativePath} ${sizeLabel}`)
    if (size > MAX_INSTALLER_SIZE) {
      console.warn(`::warning::Installer size ${sizeLabel} exceeds the 250 MiB review threshold.`)
    }
  }

  const stepSummary = process.env.GITHUB_STEP_SUMMARY
  if (stepSummary) {
    await appendFile(
      stepSummary,
      [
        '### Release package audit',
        '',
        '| Installer | Size |',
        '| --- | ---: |',
        ...summaryRows,
        '',
        'Maximum size before warning: 250 MiB per installer.',
        '',
      ].join('\n'),
      'utf8',
    )
  }

  if (failureCount > 0) {
    throw new Error(`ASAR audit failed with ${failureCount} prohibited file(s).`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
