import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

for (const outputDirectory of ['dist', 'dist-electron', 'release']) {
  await rm(path.join(projectRoot, outputDirectory), { recursive: true, force: true })
}
