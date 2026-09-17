import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Uniquement des sorties/caches de build. Les données utilisateur, SQLite,
// node_modules et les fichiers .env ne sont jamais supprimés.
const cachePaths = [
  '.next',
  '.next-dev',
  'out',
  'src-tauri/target',
  'android/.gradle',
  'android/build',
  'android/app/build',
  'ios/App/DerivedData',
]

let failed = false
for (const relativePath of cachePaths) {
  const target = path.join(root, relativePath)
  if (!existsSync(target)) continue

  try {
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 250,
    })
    console.log(`[clean-caches] supprimé: ${relativePath}`)
  } catch (error) {
    failed = true
    console.error(`[clean-caches] impossible de supprimer ${relativePath}`, error)
  }
}

if (failed) process.exitCode = 1
else console.log('[clean-caches] caches de build nettoyés; données utilisateur conservées')
