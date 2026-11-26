import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'

const aliases = {
  '@': path.resolve(import.meta.dirname, 'src'),
  '@shared': path.resolve(import.meta.dirname, 'shared'),
}

const electronMainExternals = [
  '@derhuerst/ffprobe-static',
  'exiftool-vendored',
  'exifr',
  'ffmpeg-static',
  'heic-convert',
  'music-metadata'
]

export default defineConfig({
  build: { sourcemap: false },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          resolve: { alias: aliases },
          build: {
            sourcemap: false,
            rollupOptions: { external: electronMainExternals },
          },
        },
      },
      preload: {
        input: path.join(import.meta.dirname, 'electron/preload.ts'),
        vite: {
          resolve: { alias: aliases },
          build: { sourcemap: false },
        },
      },
    }),
  ],
  resolve: { alias: aliases },
})