import { execSync, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_PORT = 3000

function parsePort() {
  const raw = process.env.PORT
  const parsed = Number(raw)
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  return DEFAULT_PORT
}

function run(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch {
    return ''
  }
}

function getPortPidsWindows(port) {
  const output = run(`netstat -ano -p tcp | findstr :${port}`)
  if (!output) return []

  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const pids = new Set()
  for (const line of lines) {
    const parts = line.split(/\s+/)
    if (parts.length < 5) continue
    const state = parts[3]?.toUpperCase()
    const pid = parts[4]
    if (state !== 'LISTENING' && state !== 'ESTABLISHED') continue
    if (/^\d+$/.test(pid)) pids.add(pid)
  }

  return Array.from(pids)
}

function getPortPidsUnix(port) {
  const output = run(`lsof -ti tcp:${port}`)
  if (!output) return []
  return output
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
}

function killPidWindows(pid) {
  run(`taskkill /PID ${pid} /F`)
}

function killPidUnix(pid) {
  run(`kill -9 ${pid}`)
}

function cleanupPort(port) {
  const isWindows = process.platform === 'win32'
  const pids = isWindows ? getPortPidsWindows(port) : getPortPidsUnix(port)
  if (pids.length === 0) {
    console.log(`[dev-clean] Port ${port} is free.`)
    return
  }

  console.log(`[dev-clean] Killing ${pids.length} process(es) on port ${port}: ${pids.join(', ')}`)
  for (const pid of pids) {
    if (pid === String(process.pid)) continue
    if (isWindows) {
      killPidWindows(pid)
    } else {
      killPidUnix(pid)
    }
  }
}

function removeNextLock() {
  const lockPath = path.resolve('.next', 'dev', 'lock')
  if (!existsSync(lockPath)) {
    console.log('[dev-clean] No .next/dev/lock found.')
    return
  }
  rmSync(lockPath, { force: true })
  console.log('[dev-clean] Removed .next/dev/lock')
}

function resolveNextBin() {
  const nextBin = path.resolve('node_modules', 'next', 'dist', 'bin', 'next')
  if (existsSync(nextBin)) return nextBin
  return null
}

function startDev(port) {
  const nextBin = resolveNextBin()
  const args = ['dev', '--webpack', '-H', '127.0.0.1', '-p', String(port)]

  console.log(`[dev-clean] Starting Next.js on http://127.0.0.1:${port}`)

  if (nextBin) {
    const child = spawn(process.execPath, [nextBin, ...args], {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (code) => process.exit(code ?? 0))
    return child
  }

  const child = spawn('npx', ['next', ...args], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  child.on('exit', (code) => process.exit(code ?? 0))
  return child
}

function main() {
  const port = parsePort()
  const noStart = process.argv.includes('--no-start')

  cleanupPort(port)
  removeNextLock()

  if (noStart) {
    console.log('[dev-clean] Cleanup complete (no-start mode).')
    process.exit(0)
  }

  const child = startDev(port)
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
}

main()
