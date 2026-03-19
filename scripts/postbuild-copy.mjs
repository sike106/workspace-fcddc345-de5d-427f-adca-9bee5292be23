import { cp, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function copyIfExists(from, to) {
  const hasSource = await exists(from)
  if (!hasSource) return
  await ensureDir(dirname(to))
  await cp(from, to, { recursive: true, force: true })
}

const root = process.cwd()
const nextStaticSrc = resolve(root, '.next', 'static')
const nextStaticDest = resolve(root, '.next', 'standalone', '.next', 'static')
const publicSrc = resolve(root, 'public')
const publicDest = resolve(root, '.next', 'standalone', 'public')

await copyIfExists(nextStaticSrc, nextStaticDest)
await copyIfExists(publicSrc, publicDest)
