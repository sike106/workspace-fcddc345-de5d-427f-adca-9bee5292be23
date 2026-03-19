import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST || ''
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '', 10)
const SMTP_USER = process.env.SMTP_USER || ''
const SMTP_PASS = process.env.SMTP_PASS || ''
const SMTP_FROM = process.env.SMTP_FROM || ''

const emailConfigured =
  SMTP_HOST &&
  Number.isFinite(SMTP_PORT) &&
  SMTP_PORT > 0 &&
  SMTP_USER &&
  SMTP_PASS &&
  SMTP_FROM

let transporter: nodemailer.Transporter | null = null

const getTransporter = () => {
  if (!emailConfigured) return null
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
  return transporter
}

type OtpEmailPayload = {
  to: string
  code: string
  purpose: 'login' | 'password_reset'
  expiresAt: Date
}

export async function sendOtpEmail(payload: OtpEmailPayload): Promise<boolean> {
  const transport = getTransporter()
  if (!transport) {
    console.warn('SMTP not configured; OTP email not sent.', {
      to: payload.to,
      purpose: payload.purpose,
      code: payload.code,
    })
    return false
  }

  const readablePurpose =
    payload.purpose === 'password_reset' ? 'password reset' : 'login'
  const subject = `Your JEE Study Buddy ${readablePurpose} OTP`
  const text = [
    `Your one-time password (OTP) for ${readablePurpose} is: ${payload.code}`,
    `It expires at: ${payload.expiresAt.toISOString()}`,
    'If you did not request this, you can ignore this email.',
  ].join('\n')

  await transport.sendMail({
    from: SMTP_FROM,
    to: payload.to,
    subject,
    text,
  })

  return true
}
