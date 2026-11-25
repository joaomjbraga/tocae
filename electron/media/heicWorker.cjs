const { createRequire } = require('node:module')
const { readFile } = require('node:fs/promises')
const { parentPort, workerData } = require('node:worker_threads')

async function convert() {
  const convertHeic = createRequire(workerData.requireFrom)('heic-convert')
  const input = await readFile(workerData.filePath)
  const jpeg = await convertHeic({ buffer: input, format: 'JPEG', quality: 0.92 })
  const output = Uint8Array.from(jpeg)
  parentPort.postMessage(output.buffer, [output.buffer])
}

convert()
  .catch((error) => {
    parentPort.postMessage({ error: error instanceof Error ? error.message : String(error) })
  })
  .finally(() => parentPort.close())
