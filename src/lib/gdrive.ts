import { google } from 'googleapis'
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
  const clientEmail = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const privateKey = getEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n')

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  cachedDrive = google.drive({ version: 'v3', auth })
  return cachedDrive
}
