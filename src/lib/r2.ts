import { S3Client } from '@aws-sdk/client-s3'

let cachedClient: S3Client | null = null

function getRequiredEnv(key: string) {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`)
  }
  return value
}

export function getR2Bucket() {
  return getRequiredEnv('R2_BUCKET')
}

export function getR2Client() {
  if (cachedClient) return cachedClient
  const accountId = getRequiredEnv('R2_ACCOUNT_ID')
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY')

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return cachedClient
}
