import { google } from 'googleapis'
import fs from 'fs'
import type { drive_v3 } from 'googleapis'

let cachedDrive: drive_v3.Drive | null = null

function getEnv(key: string) {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`)
  }
  return value
}

export function getDriveFolderId() {
  return getEnv('GOOGLE_DRIVE_FOLDER_ID')
}

export function getDriveClient(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive
  let clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ''
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  if (keyPath && fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8')
    const parsed = JSON.parse(raw)
    clientEmail = String(parsed.client_email || '')
    privateKey = String(parsed.private_key || '')
  }

  clientEmail = clientEmail || getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  privateKey = privateKey || getEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  privateKey = privateKey.replace(/\\n/g, '\n')

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  cachedDrive = google.drive({ version: 'v3', auth })
  return cachedDrive
}
