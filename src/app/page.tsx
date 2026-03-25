'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent, type ChangeEvent, type UIEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getRedirectResult, signInWithRedirect, signInWithPopup } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Switch } from '@/components/ui/switch'
import {
  BookOpen, Brain, BarChart3, FileText, Clock, User, LogOut, Menu, X,
  Send, Lightbulb, ChevronRight, Play, CheckCircle, XCircle, AlertCircle,
  TrendingUp, Target, Award, Zap, Moon, Sun, Settings, Users, Plus,
  FileQuestion, ClipboardList, RefreshCw, Download, ChevronDown, Home, Share2, Trash2, Bot, MessageSquare, Sparkles, Search, Upload
} from 'lucide-react'
import { MathText } from '@/components/math-text'
import { firebaseAuth, firebaseDb, googleAuthProvider } from '@/lib/firebase'
import {
  GUEST_AI_FEATURE_LIMIT,
  GUEST_AI_TUTOR_RESPONSE_LIMIT,
  GUEST_SESSION_MAX_AGE_MS,
} from '@/lib/guest-config'

// Types
type View = 'auth' | 'dashboard' | 'account' | 'revision' | 'pyqs' | 'mock' | 'analytics' | 'teacher' | 'mock-test' | 'ai-tutor' | 'doubts' | 'ideas'
type AuthMode = 'login' | 'signup'
type AIMode = 'exam' | 'strict' | 'friendly'

interface User {
  id: string
  email: string
  name: string
  nickname?: string | null
  avatar?: string | null
  role: string
  isGuest: boolean
  createdAt?: string
  guestExpiresAt?: string
  suspendedUntil?: string | null
  suspensionReason?: string | null
  suspensionMessagingDisabled?: boolean
}

interface Question {
  id: string
  subject: string
  chapter: string
  difficulty: string
  type: string
  question: string
  options: string | null
  pyqYear?: number
  pyqType?: string
  alternateApproach?: string | null
}

interface MockTest {
  id: string
  title: string
  description: string
  subject?: string
  chapter?: string
  difficulty?: string
  testType: string
  duration: number
  totalMarks: number
  negativeMarking: number
  questionIds: string
  questions?: Question[]
  attempted: boolean
  bestScore: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
}

interface ChatThread {
  id: string
  title: string
  mode: AIMode
  subject: string
  chapter: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

interface RevisionEntry {
  id: string
  subject: string
  chapter: string
  examType: 'JEE Main' | 'JEE Advanced'
  notes: string
  createdAt: number
  updatedAt: number
}

interface PracticeSession {
  id: string
  subject: string
  chapter?: string
  difficulty?: string
  questions: Question[]
  createdAt: number
  updatedAt: number
}

interface PracticeReview {
  friendlyMessage: string
  mistake: string
  fix: string
  alternativeApproach: string
}

interface DoubtItem {
  id: string
  title: string
  description: string
  subject: string
  chapter?: string | null
  status: 'pending' | 'resolved'
  createdAt: string
  updatedAt: string
  answerCount: number
  author: {
    id: string
    name: string
    role: string
    suspendedUntil?: string | null
    suspensionReason?: string | null
  }
}

interface DoubtReply {
  id: string
  doubtId: string
  content: string
  authorType: 'user' | 'admin' | 'ai'
  authorName: string
  authorUserId: string | null
  authorRole: string | null
  createdAt: string
}

interface SuspensionMessage {
  id: string
  userId: string
  senderType: 'user' | 'admin' | 'system'
  senderName: string | null
  message: string
  createdAt: string
}

interface SuspensionConversation {
  user: {
    id: string
    name: string
    role: string
    isGuest: boolean
    suspendedUntil: string | null
    suspensionReason: string | null
    suspensionMessagingDisabled: boolean
  }
  messages: SuspensionMessage[]
}

interface AdminActivityUser {
  id: string
  name: string
  nickname: string | null
  email: string
  role: string
  isGuest: boolean
  createdAt: string
  isSuspended: boolean
  suspendedUntil: string | null
  suspensionReason: string | null
  suspensionMessagingDisabled: boolean
  questionsSolved: number
  accuracy: number
  aiInteractions: number
  mockAttempts: number
  doubtsAsked: number
  repliesGiven: number
  appealMessages: number
  lastActivityAt: string | null
}

interface AdminChatMessage {
  id: string
  content: string
  createdAt: string
  sender: {
    id: string
    name: string
    role: string
  }
}

interface AiProviderStatus {
  provider: string
  configured: boolean
  model: string
  reasoningModel: string
  status: 'ok' | 'error' | 'disabled' | 'unknown'
  lastSuccessAt: string | null
  lastErrorAt: string | null
  lastError: string | null
  limitHint: string | null
}

interface AiStatusSnapshot {
  aiProvider: string
  providerOrder: string[]
  limits: {
    short: number
    long: number
    notes: number
    hint: number
    chat: number
    history: number
  }
  providers: AiProviderStatus[]
}

interface IdeaMessage {
  id: string
  userId: string
  senderType: 'user' | 'admin'
  senderName: string | null
  message: string
  createdAt: string
}

interface IdeaConversation {
  user: {
    id: string
    name: string
    role: string
  }
  messages: IdeaMessage[]
}

interface AccountPreferences {
  targetExam: string
  targetYear: string
  dailyQuestionGoal: number
  weeklyMockGoal: number
  preferredSubject: string
  studySlot: string
  aiTone: AIMode
  language: 'English' | 'Hindi' | 'Hinglish'
  reminderEnabled: boolean
  compactMode: boolean
  soundsEnabled: boolean
  profileVisibility: 'private' | 'public'
}

const GUEST_DEVICE_STORAGE_KEY = 'jee_guest_device_id_v1'
const VIEW_STORAGE_KEY = 'jee_view_v1'
const MAX_AVATAR_UPLOAD_BYTES = 1024 * 1024
const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

function getGuestAiUpgradeMessage(err: any, fallback: string): string {
  const code = typeof err?.code === 'string' ? err.code : ''
  if (code === 'GUEST_AI_TUTOR_LIMIT') {
    return `Guest AI Buddy limit reached (${GUEST_AI_TUTOR_RESPONSE_LIMIT} replies). Login karo to unlimited mentor guidance milegi.`
  }
  if (code === 'GUEST_AI_FEATURE_LIMIT') {
    return `Guest AI feature limit reached (${GUEST_AI_FEATURE_LIMIT} uses). Login karo to notes, hints aur AI analysis continue rahe.`
  }
  if (code === 'GUEST_EXPIRED') {
    return 'Guest session khatam ho gaya. Login karke apni preparation continue karo.'
  }
  return typeof err?.message === 'string' && err.message.trim() ? err.message : fallback
}

function getFirebaseAuthErrorMessage(err: any, fallback: string): string {
  const code = typeof err?.code === 'string' ? err.code : ''
  if (code === 'auth/unauthorized-domain') {
    return 'Google login blocked: add localhost to Firebase Authorized domains.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Google login disabled: enable Google provider in Firebase Auth.'
  }
  if (code === 'auth/popup-blocked') {
    return 'Popup blocked: allow popups or use another browser.'
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error during Google login. Check your connection.'
  }
  return typeof err?.message === 'string' && err.message.trim() ? err.message : fallback
}

function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00'
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getGuestDeviceId(): string {
  if (typeof window === 'undefined') {
    return `guest_device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  }

  const existing = window.localStorage.getItem(GUEST_DEVICE_STORAGE_KEY)
  if (existing && existing.length >= 12) {
    return existing
  }

  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `guest-${crypto.randomUUID()}`
    : `guest-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`

  window.localStorage.setItem(GUEST_DEVICE_STORAGE_KEY, generated)
  return generated
}

// API Functions
const api = {
  async request(endpoint: string, options: RequestInit = {}) {
    let res: Response
    try {
      res = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
    } catch (cause) {
      const error = new Error('Unable to reach server. Please check connection and retry.') as Error & {
        code?: string
        status?: number
        details?: any
      }
      error.code = 'NETWORK_ERROR'
      error.status = 0
      error.details = { endpoint, cause }
      throw error
    }

    let data: any = null
    try {
      data = await res.json()
    } catch {
      data = null
    }

    if (!res.ok) {
      const error = new Error(data?.error || 'Request failed') as Error & {
        code?: string
        status?: number
        details?: any
      }
      error.code = data?.code
      error.status = res.status
      error.details = data
      if (typeof window !== 'undefined' && error.code === 'GUEST_EXPIRED') {
        window.dispatchEvent(
          new CustomEvent('guest-session-expired', {
            detail: { message: error.message },
          })
        )
      }
      throw error
    }
    return data
  },

  auth: {
    login: (email: string, password: string) =>
      api.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    signup: (email: string, password: string, name: string, role: string) =>
      api.request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name, role }) }),
    google: (idToken: string, guestId?: string) =>
      api.request('/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idToken,
          ...(guestId ? { guestId } : {}),
        }),
      }),
    reauthPassword: (password: string) =>
      api.request('/auth/password/reauth', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    updateProfile: (payload: { name: string; nickname?: string; avatar?: string }) =>
      api.request('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    changePassword: (newPassword: string) =>
      api.request('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      }),
    guest: (deviceId: string) =>
      api.request('/auth/guest', { method: 'POST', body: JSON.stringify({ deviceId }) }),
    logout: () => api.request('/auth/logout', { method: 'POST' }),
    me: () => api.request('/auth/me'),
  },

  ai: {
    chat: (message: string, subject: string, chapter: string, mode: AIMode, sessionStartedAt?: number) =>
      api.request('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message,
          subject,
          chapter,
          mode,
          ...(typeof sessionStartedAt === 'number' ? { sessionStartedAt } : {})
        })
      }),
    chatStream: async (
      message: string,
      subject: string,
      chapter: string,
      mode: AIMode,
      handlers: {
        onDelta: (delta: string) => void
        onThinking?: (thinking: string) => void
      },
      sessionStartedAt?: number
    ) => {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message,
          subject,
          chapter,
          mode,
          stream: true,
          ...(typeof sessionStartedAt === 'number' ? { sessionStartedAt } : {})
        }),
      })

      if (!res.ok) {
        let error = 'Request failed'
        let payload: any = null
        try {
          payload = await res.json()
          error = payload?.error || error
        } catch {}
        const streamError = new Error(error) as Error & {
          code?: string
          status?: number
          details?: any
        }
        streamError.code = payload?.code
        streamError.status = res.status
        streamError.details = payload
        throw streamError
      }

      if (!res.body) {
        throw new Error('Streaming not supported by server')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullResponse = ''
      let modelUsed = 'stream'
      let tokensUsed = 0
      let streamError = ''

      const processEvent = (eventBlock: string) => {
        const lines = eventBlock.split(/\r?\n/)
        const dataLines = lines
          .map(line => line.trim())
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim())

        if (dataLines.length === 0) return

        const payloadText = dataLines.join('\n')
        if (!payloadText || payloadText === '[DONE]') return

        try {
          const payload = JSON.parse(payloadText)
          if (payload.type === 'delta' && typeof payload.content === 'string') {
            fullResponse += payload.content
            handlers.onDelta(payload.content)
            return
          }
          if (payload.type === 'thinking' && typeof payload.content === 'string') {
            handlers.onThinking?.(payload.content)
            return
          }
          if (payload.type === 'done') {
            modelUsed = payload.modelUsed || modelUsed
            tokensUsed = payload.tokensUsed || tokensUsed
            return
          }
          if (payload.type === 'error') {
            streamError = payload.error || 'Streaming failed'
          }
        } catch {
          // Ignore malformed events
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const eventBlock = buffer.slice(0, separatorIndex).trim()
          buffer = buffer.slice(separatorIndex + 2)
          if (eventBlock) {
            processEvent(eventBlock)
          }
          separatorIndex = buffer.indexOf('\n\n')
        }
      }

      if (buffer.trim()) {
        processEvent(buffer.trim())
      }

      if (streamError) {
        throw new Error(streamError)
      }

      return {
        success: true,
        response: fullResponse,
        modelUsed,
        tokensUsed,
      }
    },
    history: (subject?: string, chapter?: string) =>
      api.request(`/ai/chat?${subject ? `subject=${subject}&` : ''}${chapter ? `chapter=${chapter}` : ''}`),
    revise: (subject: string, chapter: string, examType: string) =>
      api.request('/ai/revise', {
        method: 'POST',
        body: JSON.stringify({ subject, chapter, examType }),
      }),
    hint: (question: string, subject: string, mode: AIMode) =>
      api.request('/ai/hint', { method: 'POST', body: JSON.stringify({ question, subject, mode }) }),
  },

  practice: {
    questions: (
      subject?: string,
      chapter?: string,
      difficulty?: string,
      opts?: { allowAi?: boolean; preferAi?: boolean }
    ) => {
      const params = new URLSearchParams()
      if (subject && subject.trim()) params.set('subject', subject.trim())
      if (chapter && chapter.trim()) params.set('chapter', chapter.trim())
      if (difficulty && difficulty.trim()) params.set('difficulty', difficulty.trim())
      if (opts?.allowAi === false) params.set('allowAi', 'false')
      if (opts?.preferAi) params.set('preferAi', 'true')
      const query = params.toString()
      return api.request(`/practice/questions${query ? `?${query}` : ''}`)
    },
    submit: (questionId: string, answer: string | number, timeTaken: number) =>
      api.request('/practice/questions', { method: 'POST', body: JSON.stringify({ questionId, answer, timeTaken }) }),
    review: (payload: any) =>
      api.request('/practice/review', { method: 'POST', body: JSON.stringify(payload) }),
  },

  pyq: {
    list: (exam?: string, subject?: string, chapter?: string, difficulty?: string, year?: string) => {
      const params = new URLSearchParams()
      if (exam) params.set('exam', exam)
      if (subject) params.set('subject', subject)
      if (chapter) params.set('chapter', chapter)
      if (difficulty) params.set('difficulty', difficulty)
      if (year) params.set('year', year)
      const query = params.toString()
      return api.request(`/pyq/questions${query ? `?${query}` : ''}`)
    },
    create: (payload: any) =>
      api.request('/pyq/questions', { method: 'POST', body: JSON.stringify(payload) }),
    approach: (payload: any) =>
      api.request('/pyq/approach', { method: 'POST', body: JSON.stringify(payload) }),
  },

  mock: {
    tests: (testType?: string, subject?: string, chapter?: string, difficulty?: string) => {
      const params = new URLSearchParams()
      if (testType) params.set('testType', testType)
      if (subject) params.set('subject', subject)
      if (chapter) params.set('chapter', chapter)
      if (difficulty) params.set('difficulty', difficulty)
      const query = params.toString()
      return api.request(`/mock/tests${query ? `?${query}` : ''}`)
    },
    start: (testId: string) =>
      api.request('/mock/start', { method: 'POST', body: JSON.stringify({ testId }) }),
    submit: (attemptId: string, answers: Record<string, string | number>, timeTaken: number) =>
      api.request('/mock/submit', { method: 'POST', body: JSON.stringify({ attemptId, answers, timeTaken }) }),
    save: (attemptId: string, answers: Record<string, string | number>, currentQuestion: number) =>
      api.request('/mock/submit', { method: 'PUT', body: JSON.stringify({ attemptId, answers, currentQuestion }) }),
    create: (payload: any) =>
      api.request('/mock/tests', { method: 'POST', body: JSON.stringify(payload) }),
  },

  analytics: {
    dashboard: () => api.request('/analytics/dashboard'),
    leaderboard: (limit = 10) => api.request(`/analytics/leaderboard?limit=${limit}`),
    rank: () => api.request('/analytics/rank'),
  },

  teacher: {
    students: () => api.request('/teacher/students'),
    questions: (params?: { subject?: string; exam?: string; limit?: number | 'all' }) => {
      const queryParams = new URLSearchParams()
      if (params?.subject) queryParams.set('subject', params.subject)
      if (params?.exam) queryParams.set('exam', params.exam)
      if (params?.limit !== undefined) queryParams.set('limit', String(params.limit))
      const query = queryParams.toString()
      return api.request(`/teacher/questions${query ? `?${query}` : ''}`)
    },
    createQuestion: (data: any) =>
      api.request('/teacher/questions', { method: 'POST', body: JSON.stringify(data) }),
    deleteQuestions: (payload: { all?: boolean; exam?: string; id?: string; ids?: string[] }) =>
      api.request('/teacher/questions', { method: 'DELETE', body: JSON.stringify(payload) }),
  },

  doubts: {
    list: (search?: string, subject?: string, status?: string) => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (subject && subject !== 'all') params.set('subject', subject)
      if (status && status !== 'all') params.set('status', status)
      const query = params.toString()
      return api.request(`/doubts${query ? `?${query}` : ''}`)
    },
    create: (payload: { title: string; description: string; subject: string; chapter?: string }) =>
      api.request('/doubts', { method: 'POST', body: JSON.stringify(payload) }),
    replies: (doubtId: string) =>
      api.request(`/doubts/${doubtId}/replies`),
    addReply: (doubtId: string, content: string) =>
      api.request(`/doubts/${doubtId}/replies`, { method: 'POST', body: JSON.stringify({ content }) }),
  },

  ideas: {
    messages: (userId?: string) => {
      const params = new URLSearchParams()
      if (userId) params.set('userId', userId)
      const query = params.toString()
      return api.request(`/ideas/messages${query ? `?${query}` : ''}`)
    },
    sendMessage: (message: string, userId?: string) =>
      api.request('/ideas/messages', {
        method: 'POST',
        body: JSON.stringify({
          message,
          ...(userId ? { userId } : {}),
        }),
      }),
  },

  admin: {
    activityUsers: (limit = 200) =>
      api.request(`/admin/users/activity?limit=${limit}`),
    suspendedUsers: () =>
      api.request('/admin/users/suspended'),
    chatMessages: (limit = 200) =>
      api.request(`/admin/chat?limit=${limit}`),
    aiStatus: () =>
      api.request('/admin/ai/status'),
    sendChatMessage: (content: string) =>
      api.request('/admin/chat', { method: 'POST', body: JSON.stringify({ content }) }),
    suspendUser: (userId: string, payload: { reason: string; minutes: number }) =>
      api.request(`/admin/users/${userId}/suspension`, { method: 'POST', body: JSON.stringify(payload) }),
    unrestrictUser: (userId: string) =>
      api.request(`/admin/users/${userId}/suspension`, { method: 'DELETE' }),
    setSuspensionMessaging: (userId: string, messagingDisabled: boolean) =>
      api.request(`/admin/users/${userId}/suspension`, {
        method: 'PATCH',
        body: JSON.stringify({ messagingDisabled }),
      }),
  },

  suspension: {
    messages: (userId?: string) => {
      const params = new URLSearchParams()
      if (userId) params.set('userId', userId)
      const query = params.toString()
      return api.request(`/suspension/messages${query ? `?${query}` : ''}`)
    },
    sendMessage: (message: string, userId?: string) =>
      api.request('/suspension/messages', {
        method: 'POST',
        body: JSON.stringify({
          message,
          ...(userId ? { userId } : {}),
        }),
      }),
  },
}

// Subject and Chapter data
const SUBJECTS = {
  Physics: [
    'Class 11: Units and Measurements (units, dimensional analysis, measurement errors)',
    'Class 11: Kinematics (1D/2D motion, projectile, uniform circular motion)',
    'Class 11: Laws of Motion (Newton’s laws, friction, circular motion dynamics)',
    'Class 11: Work, Energy, and Power (work-energy theorem, PE/KE, power)',
    'Class 11: System of Particles and Rotational Motion (COM, torque, angular momentum)',
    'Class 11: Gravitation (universal law, potential energy, satellite motion)',
    'Class 11: Properties of Bulk Matter (solids/fluids, thermal properties, fluid dynamics)',
    'Class 11: Thermodynamics (laws, heat engines, entropy)',
    'Class 11: Perfect Gas and Kinetic Theory (gas laws, kinetic theory, molecular speeds)',
    'Class 11: Oscillations and Waves (SHM, wave motion, sound waves)',
    'Class 12: Electrostatics (charges, Coulomb’s law, field, potential)',
    'Class 12: Current Electricity (Ohm’s law, circuits, electrical energy)',
    'Class 12: Magnetic Effects of Current and Magnetism (Biot–Savart, Ampere’s law, materials)',
    'Class 12: Electromagnetic Induction and AC (Faraday’s laws, inductance, AC circuits)',
    'Class 12: Electromagnetic Waves (properties, applications)',
    'Class 12: Optics (reflection, refraction, lenses, instruments)',
    'Class 12: Dual Nature of Matter and Radiation (photoelectric effect, de Broglie)',
    'Class 12: Atoms and Nuclei (atomic models, radioactivity, nuclear reactions)',
    'Class 12: Electronic Devices (semiconductors, diodes, transistors)'
  ],
  Chemistry: [
    'Some Basic Concepts of Chemistry',
    'Atomic Structure',
    'Chemical Bonding and Molecular Structure',
    'Chemical Thermodynamics',
    'Equilibrium',
    'Redox Reactions and Electrochemistry',
    'Solutions',
    'Chemical Kinetics',
    'Classification of Elements and Periodicity in Properties',
    'p-block Elements (Group 13 and 14)',
    'd- and f-block Elements',
    'Coordination Compounds',
    'Purification and Characterization of Organic Compounds',
    'Some Basic Principles of Organic Chemistry',
    'Hydrocarbons',
    'Organic Compounds Containing Halogens, Oxygen, and Nitrogen',
    'Principles Related to Practical Chemistry'
  ],
  Mathematics: [
    'Sets, relations, and functions',
    'Types of functions (one-one, onto, etc.)',
    'Complex numbers',
    'Quadratic equations',
    'Sequences and series',
    'Permutations and combinations',
    'Binomial theorem',
    'Matrices and determinants',
    'Trigonometric functions and identities',
    'Inverse trigonometric functions',
    'Limits and continuity',
    'Differentiation and its applications',
    'Integration and its applications',
    'Differential equations',
    'Measures of central tendency and dispersion',
    'Probability and its applications',
    'Statements, logical operations, and quantifiers',
    'Vector algebra and its applications',
    'Formulation and graphical method',
    'Mathematical Induction'
  ],
  Biology: [
    'Class 11: The Living World',
    'Class 11: Biological Classification',
    'Class 11: Plant Kingdom',
    'Class 11: Animal Kingdom',
    'Class 11: Morphology of Flowering Plants',
    'Class 11: Anatomy of Flowering Plants',
    'Class 11: Structural Organisation in Animals',
    'Class 11: Cell: The Unit of Life',
    'Class 11: Biomolecules',
    'Class 11: Cell Cycle and Cell Division',
    'Class 11: Transport in Plants',
    'Class 11: Mineral Nutrition',
    'Class 11: Photosynthesis in Higher Plants',
    'Class 11: Respiration in Plants',
    'Class 11: Plant Growth and Development',
    'Class 11: Digestion and Absorption',
    'Class 11: Breathing and Exchange of Gases',
    'Class 11: Body Fluids and Circulation',
    'Class 11: Excretory Products and Their Elimination',
    'Class 11: Locomotion and Movement',
    'Class 11: Neural Control and Coordination',
    'Class 11: Chemical Coordination and Integration',
    'Class 12: Reproduction in Organisms',
    'Class 12: Sexual Reproduction in Flowering Plants',
    'Class 12: Human Reproduction',
    'Class 12: Reproductive Health',
    'Class 12: Principles of Inheritance and Variation',
    'Class 12: Molecular Basis of Inheritance',
    'Class 12: Evolution',
    'Class 12: Human Health and Disease',
    'Class 12: Strategies for Enhancement in Food Production',
    'Class 12: Microbes in Human Welfare',
    'Class 12: Biotechnology: Principles and Processes',
    'Class 12: Biotechnology and Its Applications',
    'Class 12: Organisms and Populations',
    'Class 12: Ecosystem',
    'Class 12: Biodiversity and Conservation',
    'Class 12: Environmental Issues'
  ]
}

const PYQ_EXAMS = [
  'JEE Main',
  'JEE Advanced',
  'BITSAT',
  'KCET',
  'WBJEE',
  'MHT CET',
  'IAT (IISER Aptitude Test)',
  'COMEDK UGET',
  'VITEEE',
  'SRMJEEE',
  'KIITEE',
  'MET',
  'AP EAPCET',
  'TS EAMCET'
]

const PYQ_LOGOS: Record<string, string> = {
  'JEE Main': '/pyq-logos/jee-main.png',
  'JEE Advanced': '/pyq-logos/jee-advanced.png',
  'BITSAT': '/pyq-logos/bitsat.png',
  'KCET': '/pyq-logos/kcet.png',
  'WBJEE': '/pyq-logos/wbjee.png',
  'MHT CET': '/pyq-logos/mht-cet.png',
  'IAT (IISER Aptitude Test)': '/pyq-logos/iat.png',
  'COMEDK UGET': '/pyq-logos/comedk.jpg',
  'VITEEE': '/pyq-logos/viteee.webp',
  'SRMJEEE': '/pyq-logos/srmjeee.png',
  'KIITEE': '/pyq-logos/kiitee.jpg',
  'MET': '/pyq-logos/met.svg',
  'AP EAPCET': '/pyq-logos/ap-eapcet.png',
  'TS EAMCET': '/pyq-logos/ts-eamcet.jpg'
}

const PYQ_YEARS = Array.from({ length: 25 }, (_, i) => 2002 + i).reverse()

const PYQ_EXAM_SUBJECTS: Record<string, string[]> = {
  'IAT (IISER Aptitude Test)': ['Physics', 'Chemistry', 'Mathematics', 'Biology']
}

export default function JEEStudyBuddy() {
  const [view, setView] = useState<View>('auth')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [authNotice, setAuthNotice] = useState('')
  const [guestTimeLeftMs, setGuestTimeLeftMs] = useState<number | null>(null)
  const guestSessionEndedRef = useRef(false)
  const viewRestoredRef = useRef(false)
  const overflowLockRef = useRef<{ html: string; body: string } | null>(null)

  const guestExpiresAtMs = useMemo(() => {
    if (!user?.isGuest) return null

    const explicitExpiresAt = user.guestExpiresAt ? new Date(user.guestExpiresAt).getTime() : NaN
    const createdAtBasedExpiresAt = user.createdAt
      ? new Date(user.createdAt).getTime() + GUEST_SESSION_MAX_AGE_MS
      : NaN

    if (Number.isFinite(explicitExpiresAt)) return explicitExpiresAt
    if (Number.isFinite(createdAtBasedExpiresAt)) return createdAtBasedExpiresAt
    return Date.now() + GUEST_SESSION_MAX_AGE_MS
  }, [user])

  const forceGuestLogoutToAuth = useCallback(async (notice: string) => {
    if (guestSessionEndedRef.current) return
    guestSessionEndedRef.current = true

    try {
      await api.auth.logout()
    } catch {
      // Ignore logout network errors while forcing local sign-out.
    }

    setUser(null)
    setView('auth')
    setAuthNotice(notice)
    setGuestTimeLeftMs(null)
  }, [])

  // Check auth on mount
  useEffect(() => {
      api.auth.me()
      .then(data => {
        if (data?.user) {
          setUser(data.user)
          const defaultView = data.user.role === 'teacher' ? 'teacher' : 'dashboard'
          let nextView = defaultView

          if (typeof window !== 'undefined') {
            const stored = window.sessionStorage.getItem(VIEW_STORAGE_KEY) as View | null
            const isStaff = data.user.role === 'admin' || data.user.role === 'teacher'
            const validViews = new Set<View>([
              'dashboard',
              'account',
              'revision',
              'pyqs',
              'mock',
              'analytics',
              'teacher',
              'mock-test',
              'ai-tutor',
              'doubts',
              'ideas'
            ])
            if (stored && validViews.has(stored) && (stored !== 'teacher' || isStaff)) {
              nextView = stored
            }
          }

          setView(nextView)
          setAuthNotice('')
        } else {
          setUser(null)
          setView('auth')
          setAuthNotice('')
        }
      })
      .catch((err: any) => {
        setUser(null)
        setView('auth')
        if (err?.code === 'SUSPENDED') {
          const until = err?.details?.suspendedUntil
            ? new Date(err.details.suspendedUntil).toLocaleString()
            : ''
          setAuthNotice(
            until
              ? `Account suspended until ${until}.`
              : (err?.message || 'Your account is temporarily suspended.')
          )
        } else if (err?.code === 'GUEST_EXPIRED') {
          setAuthNotice('Guest session expired after 10 minutes. Start a new guest session or sign in.')
        } else {
          setAuthNotice('')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handleGuestExpired = (event: Event) => {
      const payload = (event as CustomEvent<{ message?: string }>).detail
      const notice = payload?.message || 'Guest session expired. Please log in to continue your preparation.'
      void forceGuestLogoutToAuth(notice)
    }

    window.addEventListener('guest-session-expired', handleGuestExpired as EventListener)
    return () => window.removeEventListener('guest-session-expired', handleGuestExpired as EventListener)
  }, [forceGuestLogoutToAuth])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (view === 'auth') return
    window.sessionStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (view === 'ai-tutor') {
      if (!overflowLockRef.current) {
        overflowLockRef.current = {
          html: document.documentElement.style.overflow || '',
          body: document.body.style.overflow || ''
        }
      }
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return
    }

    if (overflowLockRef.current) {
      document.documentElement.style.overflow = overflowLockRef.current.html
      document.body.style.overflow = overflowLockRef.current.body
      overflowLockRef.current = null
    }
  }, [view])

  useEffect(() => {
    if (!user) {
      viewRestoredRef.current = false
    }
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user || viewRestoredRef.current) return

    const stored = window.sessionStorage.getItem(VIEW_STORAGE_KEY) as View | null
    const isStaff = user.role === 'teacher' || user.role === 'admin'
    const isAllowed = stored && stored !== 'auth' && (stored !== 'teacher' || isStaff)

    if (isAllowed && stored !== view) {
      setView(stored as View)
    }

    viewRestoredRef.current = true
  }, [user, view])

  useEffect(() => {
    if (!user?.isGuest) {
      guestSessionEndedRef.current = false
    }
  }, [user?.isGuest])

  useEffect(() => {
    if (!user?.isGuest || !guestExpiresAtMs) return

    const tick = () => {
      const leftMs = guestExpiresAtMs - Date.now()
      const safeLeft = Math.max(0, leftMs)
      setGuestTimeLeftMs(safeLeft)

      if (leftMs <= 0) {
        void forceGuestLogoutToAuth(
          'Guest time is over. Login karo aur apni preparation ko bina rukawat continue karo.'
        )
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [forceGuestLogoutToAuth, guestExpiresAtMs, user?.isGuest])

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const handleSetView = (nextView: View) => {
    if (nextView === 'ai-tutor') {
      setSidebarOpen(true)
    }
    setView(nextView)
  }

  const handleLogout = async () => {
    try {
      await api.auth.logout()
    } catch (err) {
      console.warn('Logout request failed, applying local logout fallback.', err)
    }
    guestSessionEndedRef.current = false
    setUser(null)
    setView('auth')
    setAuthNotice('')
    setGuestTimeLeftMs(null)
  }

  const handleUserUpdated = useCallback((updatedUser: User) => {
    setUser(updatedUser)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen text-white">
        <AnimatePresence mode="wait">
          {view === 'auth' ? (
            <AuthPage
              key="auth"
              authMode={authMode}
              setAuthMode={setAuthMode}
              setUser={setUser}
              setView={handleSetView}
              authNotice={authNotice}
            />
          ) : (
            <MainLayout
              key="main"
              view={view}
              setView={handleSetView}
              user={user}
              onUserUpdated={handleUserUpdated}
              onLogout={handleLogout}
              darkMode={darkMode}
              setDarkMode={setDarkMode}
              sidebarOpen={sidebarOpen}
              setSidebarOpen={setSidebarOpen}
              guestTimeLeftMs={guestTimeLeftMs}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Auth Page Component
function AuthPage({
  authMode,
  setAuthMode,
  setUser,
  setView,
  authNotice
}: {
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
  setUser: (user: User) => void
  setView: (view: View) => void
  authNotice?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('student')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setError('')
  }, [authMode])

  useEffect(() => {
    let cancelled = false

    const completeGoogleRedirect = async () => {
      try {
        const result = await getRedirectResult(firebaseAuth)
        if (!result) return

        const idToken = await result.user.getIdToken()
        const data = await api.auth.google(idToken)
        if (cancelled) return
        setUser(data.user)
        setView(data.user.role === 'teacher' ? 'teacher' : 'dashboard')
      } catch (err: any) {
        if (cancelled) return
        console.error('Google login redirect failed:', err)
        setError(getFirebaseAuthErrorMessage(err, 'Google login failed'))
      }
    }

    void completeGoogleRedirect()
    return () => {
      cancelled = true
    }
  }, [setUser, setView])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      let data
      if (authMode === 'login') {
        data = await api.auth.login(email, password)
      } else if (authMode === 'signup') {
        data = await api.auth.signup(email, password, name, role)
      } else {
        return
      }
      setUser(data.user)
      setView(data.user.role === 'teacher' ? 'teacher' : 'dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setError('')
    setLoading(true)
    try {
      const deviceId = getGuestDeviceId()
      const data = await api.auth.guest(deviceId)
      setUser(data.user)
      setView('dashboard')
    } catch (err: any) {
      if (err?.code === 'GUEST_DEVICE_LIMIT') {
        const allowed = err?.details?.allowedLogins || 2
        setError(`This device reached the guest limit (${allowed} logins). Please sign in or sign up.`)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      googleAuthProvider.setCustomParameters({ prompt: 'select_account' })
      const result = await signInWithPopup(firebaseAuth, googleAuthProvider)
      const idToken = await result.user.getIdToken()
      const data = await api.auth.google(idToken)
      setUser(data.user)
      setView(data.user.role === 'teacher' ? 'teacher' : 'dashboard')
      setLoading(false)
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(firebaseAuth, googleAuthProvider)
          return
        } catch (redirectErr: any) {
          console.error('Google login redirect failed:', redirectErr)
          setError(getFirebaseAuthErrorMessage(redirectErr, 'Google login failed'))
        } finally {
          setLoading(false)
        }
        return
      }
      console.error('Google login start failed:', err)
      setError(getFirebaseAuthErrorMessage(err, 'Google login failed'))
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <Brain className="w-12 h-12 text-blue-400" />
            <h1 className="text-3xl font-bold bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              JEE Study Buddy
            </h1>
          </div>
          <p className="text-slate-400">AI-Powered JEE Preparation Platform</p>
          {authNotice && (
            <p className="mt-3 text-sm text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
              {authNotice}
            </p>
          )}
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-8 border border-slate-700"
        >
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                authMode === 'login'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                authMode === 'signup'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="email@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Password"
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-linear-to-r from-blue-500 to-purple-500 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
              ) : (
                authMode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          {(authMode === 'login' || authMode === 'signup') && (
            <div className="mt-4">
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                <div className="h-px flex-1 bg-slate-700" />
                <span>or</span>
                <div className="h-px flex-1 bg-slate-700" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-3 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-sm font-bold">
                  G
                </span>
                Login by Google
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-700">
            <button
              onClick={handleGuest}
              disabled={loading}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" />
              Continue as Guest
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// Main Layout Component
function MainLayout({
  view,
  setView,
  user,
  onUserUpdated,
  onLogout,
  darkMode,
  setDarkMode,
  sidebarOpen,
  setSidebarOpen,
  guestTimeLeftMs
}: {
  view: View
  setView: (view: View) => void
  user: User | null
  onUserUpdated: (user: User) => void
  onLogout: () => void
  darkMode: boolean
  setDarkMode: (mode: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  guestTimeLeftMs: number | null
}) {
  const isStaff = user?.role === 'teacher' || user?.role === 'admin'
  const suspendedUntilMs = user?.suspendedUntil ? new Date(user.suspendedUntil).getTime() : null
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now())
  const [isMobile, setIsMobile] = useState(false)
  const adsInjectedRef = useRef(false)
  const isSuspended =
    typeof suspendedUntilMs === 'number' &&
    Number.isFinite(suspendedUntilMs) &&
    suspendedUntilMs > currentTimeMs

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile, setSidebarOpen])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const isStaff = user?.role === 'admin' || user?.role === 'teacher'
    const head = document.head || document.documentElement

    const removeAds = () => {
      const existing = document.querySelectorAll('script[data-ad-runtime="true"]')
      existing.forEach(node => node.parentElement?.removeChild(node))
    }

    const addHeadScript = (options: { src: string; attrs?: Record<string, string> }) => {
      const script = document.createElement('script')
      script.setAttribute('data-ad-runtime', 'true')
      script.async = true
      script.src = options.src
      if (options.attrs) {
        Object.entries(options.attrs).forEach(([key, value]) => {
          script.setAttribute(key, value)
        })
      }
      head.appendChild(script)
    }

    const injectAds = () => {
      addHeadScript({
        src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6942703237637346',
        attrs: { crossorigin: 'anonymous' }
      })
      addHeadScript({
        src: 'https://pl28976126.profitablecpmratenetwork.com/1e/86/ca/1e86cab17da918649fa4f1a098e2456a.js'
      })
    }

    const adBlockedViews = new Set<View>(['ai-tutor', 'pyqs', 'mock', 'mock-test'])

    if (view === 'auth' || isStaff || adBlockedViews.has(view)) {
      removeAds()
      return
    }

    if (adsInjectedRef.current) return

    injectAds()
    adsInjectedRef.current = true
  }, [user?.role, view])

  useEffect(() => {
    if (!isSuspended) return
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isSuspended])

  const navItems = isStaff ? [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'ai-tutor', label: 'AI Buddy', icon: Bot },
    { id: 'doubts', label: 'Doubt Clearing', icon: MessageSquare },
    { id: 'ideas', label: 'Idea Box', icon: Lightbulb },
    { id: 'revision', label: 'Revision', icon: FileText },
    { id: 'pyqs', label: 'PYQs', icon: FileQuestion },
    { id: 'mock', label: 'Mock Tests', icon: Clock },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'teacher', label: 'Admin', icon: Users },
    { id: 'account', label: 'My Account', icon: User },
  ] : [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'ai-tutor', label: 'AI Buddy', icon: Bot },
    { id: 'doubts', label: 'Doubt Clearing', icon: MessageSquare },
    { id: 'ideas', label: 'Idea Box', icon: Lightbulb },
    { id: 'revision', label: 'Revision', icon: FileText },
    { id: 'pyqs', label: 'PYQs', icon: FileQuestion },
    { id: 'mock', label: 'Mock Tests', icon: Clock },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'account', label: 'My Account', icon: User },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={
          isMobile
            ? { x: sidebarOpen ? 0 : -256 }
            : { width: sidebarOpen ? 256 : 80 }
        }
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        style={isMobile ? { width: 256 } : undefined}
        className="fixed md:static inset-y-0 left-0 z-40 bg-slate-800/50 backdrop-blur-xl border-r border-slate-700 flex flex-col min-h-0"
      >
        {/* Logo */}
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <Brain className="w-8 h-8 text-blue-400 shrink-0" />
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-lg bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent whitespace-nowrap"
            >
              JEE Study Buddy
            </motion.span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setView(item.id as View)
                if (isMobile) {
                  setSidebarOpen(false)
                }
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                view === item.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="whitespace-nowrap"
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-slate-700 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {getAvatarSource(user) ? (
              <img
                src={getAvatarSource(user)}
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover border border-slate-600 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-400 to-purple-400 flex items-center justify-center font-bold shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            {sidebarOpen && (
              <div className="overflow-hidden">
                <p className="font-medium truncate">{user?.name}</p>
                {user?.nickname && <p className="text-xs text-blue-300 truncate">@{user.nickname}</p>}
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <div className="flex gap-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex-1 p-2 bg-slate-700/50 rounded-lg hover:bg-slate-600/50 transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4 mx-auto" /> : <Moon className="w-4 h-4 mx-auto" />}
              </button>
              <button
                onClick={onLogout}
                className="flex-1 p-2 bg-slate-700/50 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4 mx-auto" />
              </button>
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className={`flex-1 min-h-0 ${view === 'ai-tutor' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {/* Header */}
        <header className="bg-slate-800/30 backdrop-blur-sm border-b border-slate-700 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-10 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg md:text-xl font-semibold capitalize truncate">{view.replace('-', ' ')}</h1>
          <div className="flex items-center gap-2">
            {isSuspended && (
              <span className="text-xs px-2 py-1 rounded-full border border-red-500/40 bg-red-500/10 text-red-200">
                Restricted Mode
              </span>
            )}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-red-500/20 hover:text-red-300 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className={`p-4 md:p-6 ${view === 'ai-tutor' ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : ''}`}>
          {isSuspended ? (
            <SuspendedModeNotice
              view={view}
              user={user}
              suspendedUntil={user?.suspendedUntil || null}
              suspensionReason={user?.suspensionReason || null}
            />
          ) : (
            <AnimatePresence mode="wait">
              {view === 'dashboard' && <Dashboard key="dashboard" />}
              {view === 'account' && (
                <MyAccount
                  key={`account-${user?.id || 'anon'}`}
                  user={user}
                  onUserUpdated={onUserUpdated}
                />
              )}
              {view === 'revision' && <Revision key={`revision-${user?.id || 'anon'}`} user={user} />}
              {view === 'pyqs' && <PYQs key="pyqs" user={user} />}
              {view === 'mock' && <MockTests key="mock" setView={setView} user={user} />}
              {view === 'mock-test' && <MockTestView key={`mock-test-${user?.id || 'anon'}`} setView={setView} user={user} />}
              {view === 'analytics' && <Analytics key="analytics" />}
              {view === 'teacher' && <TeacherDashboard key="teacher" user={user} />}
              {view === 'ai-tutor' && <AITutor key={`ai-tutor-${user?.id || 'anon'}`} user={user} />}
              {view === 'doubts' && <DoubtClearing key="doubts" user={user} />}
              {view === 'ideas' && <IdeaChat key={`ideas-${user?.id || 'anon'}`} user={user} />}
            </AnimatePresence>
          )}
        </div>
      </main>

      {user?.isGuest && typeof guestTimeLeftMs === 'number' && guestTimeLeftMs > 0 && (
        <GuestSessionFloatingTimer timeLeftMs={guestTimeLeftMs} />
      )}
    </div>
  )
}

function formatSuspensionCountdown(iso: string | null): string {
  if (!iso) return 'a short time'
  const remainingMs = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'less than a minute'
  const totalMinutes = Math.ceil(remainingMs / 60000)
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours}h ${minutes}m`
}

function SuspendedModeNotice({
  view,
  user,
  suspendedUntil,
  suspensionReason,
}: {
  view: View
  user: User | null
  suspendedUntil: string | null
  suspensionReason: string | null
}) {
  const [conversation, setConversation] = useState<SuspensionConversation | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(true)
  const [conversationError, setConversationError] = useState('')
  const [appealInput, setAppealInput] = useState('')
  const [sendingAppeal, setSendingAppeal] = useState(false)

  const loadConversation = useCallback(async () => {
    if (!user?.id) {
      setConversation(null)
      setLoadingConversation(false)
      return
    }

    setLoadingConversation(true)
    setConversationError('')
    try {
      const data = await api.suspension.messages()
      const payload = data?.conversation
      if (!payload || !payload.user || !Array.isArray(payload.messages)) {
        throw new Error('Unable to load admin support chat.')
      }
      setConversation({
        user: {
          id: String(payload.user.id),
          name: String(payload.user.name || 'User'),
          role: String(payload.user.role || 'student'),
          isGuest: Boolean(payload.user.isGuest),
          suspendedUntil:
            typeof payload.user.suspendedUntil === 'string' ? payload.user.suspendedUntil : null,
          suspensionReason:
            typeof payload.user.suspensionReason === 'string' ? payload.user.suspensionReason : null,
          suspensionMessagingDisabled: Boolean(payload.user.suspensionMessagingDisabled),
        },
        messages: payload.messages.map((item: any) => ({
          id: String(item.id),
          userId: String(item.userId),
          senderType:
            item.senderType === 'admin' || item.senderType === 'system' ? item.senderType : 'user',
          senderName: typeof item.senderName === 'string' ? item.senderName : null,
          message: String(item.message || ''),
          createdAt: String(item.createdAt),
        })),
      })
    } catch (err: any) {
      setConversation(null)
      setConversationError(err?.message || 'Unable to load admin support chat.')
    } finally {
      setLoadingConversation(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadConversation()
  }, [loadConversation])

  const messagingDisabled = conversation?.user?.suspensionMessagingDisabled || false
  const hasAdminMessage = conversation?.messages?.some(
    message => message.senderType === 'admin' || message.senderType === 'system'
  ) ?? false
  const canSendMessage = !messagingDisabled && hasAdminMessage

  const handleSendAppeal = async () => {
    const message = appealInput.trim()
    if (!message || sendingAppeal || !canSendMessage) return

    setSendingAppeal(true)
    setConversationError('')
    try {
      const data = await api.suspension.sendMessage(message)
      const sentMessage = data?.message
      if (sentMessage?.id) {
        setConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: String(sentMessage.id),
                userId: String(sentMessage.userId || user?.id || ''),
                senderType: 'user',
                senderName: typeof sentMessage.senderName === 'string' ? sentMessage.senderName : user?.name || null,
                message: String(sentMessage.message || message),
                createdAt: String(sentMessage.createdAt || new Date().toISOString()),
              },
            ],
          }
        })
      } else {
        await loadConversation()
      }
      setAppealInput('')
    } catch (err: any) {
      setConversationError(err?.message || 'Unable to send message to admin right now.')
    } finally {
      setSendingAppeal(false)
    }
  }

  return (
    <motion.div
      key={`suspended-${view}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-4"
    >
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6">
        <h2 className="text-2xl font-semibold text-red-100">Account Temporarily Restricted</h2>
        <p className="mt-2 text-sm text-red-100/90">
          Navigation is enabled, but all study actions are blocked during suspension.
        </p>
        <p className="mt-3 text-sm text-red-50">
          Access returns in {formatSuspensionCountdown(suspendedUntil)}.
          {suspendedUntil ? ` Ends at ${new Date(suspendedUntil).toLocaleString()}.` : ''}
        </p>
        {suspensionReason && (
          <p className="mt-2 text-sm text-red-100">Reason: {suspensionReason}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-300" />
            Talk to Admin
          </h3>
          <button
            type="button"
            onClick={() => void loadConversation()}
            className="px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 flex items-center gap-2"
            disabled={loadingConversation}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingConversation ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <p className="text-sm text-slate-300 mt-1">
          Agar aap unblock request karna chahte ho, yahan message bhejo. Admin aapka text padhkar decision lega.
        </p>

        {conversationError && (
          <p className="mt-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {conversationError}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 max-h-64 overflow-y-auto space-y-2">
          {loadingConversation ? (
            <p className="text-sm text-slate-400">Loading messages...</p>
          ) : conversation?.messages?.length ? (
            conversation.messages.map(message => {
              const isUserMessage = message.senderType === 'user'
              const bubbleClass = isUserMessage
                ? 'ml-auto bg-blue-500/20 border-blue-500/30 text-blue-100'
                : message.senderType === 'admin'
                  ? 'mr-auto bg-green-500/15 border-green-500/30 text-green-100'
                  : 'mr-auto bg-slate-700/50 border-slate-600 text-slate-100'
              const label = isUserMessage
                ? 'You'
                : message.senderType === 'admin'
                  ? 'Admin'
                  : 'System'

              return (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${bubbleClass}`}
                >
                  <p className="text-[11px] opacity-80 mb-1">
                    {label} | {new Date(message.createdAt).toLocaleString()}
                  </p>
                  <p className="whitespace-pre-wrap">{message.message}</p>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-slate-400">No messages yet. Wait for admin to message you first.</p>
          )}
        </div>

        {!hasAdminMessage && (
          <p className="mt-3 text-sm text-slate-200 bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2">
            Admin se pehle message aayega tabhi aap reply kar sakte ho.
          </p>
        )}

        {messagingDisabled && (
          <p className="mt-3 text-sm text-yellow-100 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
            Admin has paused your messages in this support box for now.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <textarea
            value={appealInput}
            onChange={e => setAppealInput(e.target.value)}
            placeholder={
              messagingDisabled
                ? 'Messaging paused by admin'
                : !hasAdminMessage
                  ? 'Wait for admin message to reply'
                  : 'Type your message to admin...'
            }
            disabled={!canSendMessage || sendingAppeal}
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-600 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={handleSendAppeal}
            disabled={!appealInput.trim() || sendingAppeal || !canSendMessage}
            className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium self-end"
          >
            {sendingAppeal ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function GuestSessionFloatingTimer({ timeLeftMs }: { timeLeftMs: number }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-2xl border border-blue-400/40 bg-slate-900/90 backdrop-blur px-4 py-3 shadow-lg">
      <p className="text-xs text-blue-200 uppercase tracking-wide">Guest Session</p>
      <p className="text-lg font-semibold text-white">{formatCountdown(timeLeftMs)}</p>
      <p className="text-xs text-slate-300 mt-1">Login to keep full AI access and save progress.</p>
    </div>
  )
}

// Dashboard Component
function Dashboard() {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.analytics.dashboard()
      .then(data => setAnalytics(data.analytics))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Welcome Card */}
      <div className="bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/30">
        <h2 className="text-2xl font-bold mb-2">Welcome back! Ready to crack JEE?</h2>
        <p className="text-slate-400">Continue your preparation journey with AI-powered learning.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          label="Overall Accuracy"
          value={`${analytics?.overallAccuracy || 0}%`}
          color="blue"
        />
        <StatCard
          icon={BookOpen}
          label="Questions Solved"
          value={analytics?.totalQuestions || 0}
          color="green"
        />
        <StatCard
          icon={ClipboardList}
          label="Tests Taken"
          value={analytics?.totalTests || 0}
          color="purple"
        />
        <StatCard
          icon={TrendingUp}
          label="Predicted Rank"
          value={analytics?.rankPrediction?.rankRange?.min?.toLocaleString() || 'N/A'}
          color="orange"
        />
      </div>

      {/* Subject Progress */}
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Subject-wise Progress</h3>
        <div className="space-y-4">
          {analytics?.subjectAnalytics?.map((subject: any) => (
            <div key={subject.subject} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{subject.subject}</span>
                <span className="text-slate-400">{subject.accuracy}% accuracy</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${subject.progress}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-full bg-linear-to-r from-blue-500 to-purple-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickActionCard
          icon={BookOpen}
          title="Practice Now"
          description="Solve targeted chapter questions"
          color="blue"
        />
        <QuickActionCard
          icon={FileText}
          title="Revise Chapter"
          description="Generate quick revision notes"
          color="purple"
        />
        <QuickActionCard
          icon={Clock}
          title="Take Mock Test"
          description="Test your preparation"
          color="green"
        />
      </div>

      {/* Weak Areas */}
      {analytics?.weakAreas?.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-400" />
            Areas to Improve
          </h3>
          <div className="flex flex-wrap gap-2">
            {analytics.weakAreas.slice(0, 5).map((area: string) => (
              <span
                key={area}
                className="px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function getAvatarSource(user: User | null | undefined): string {
  const value = typeof user?.avatar === 'string' ? user.avatar.trim() : ''
  return value
}

function MyAccount({ user, onUserUpdated }: { user: User | null; onUserUpdated: (user: User) => void }) {
  const [profileName, setProfileName] = useState(user?.name || '')
  const [profileNickname, setProfileNickname] = useState(user?.nickname || '')
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')

  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthLoading, setReauthLoading] = useState(false)
  const [reauthDeadlineMs, setReauthDeadlineMs] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const defaultPrefs = useMemo<AccountPreferences>(() => ({
    targetExam: 'JEE Advanced',
    targetYear: String(new Date().getFullYear() + 1),
    dailyQuestionGoal: 40,
    weeklyMockGoal: 2,
    preferredSubject: 'Physics',
    studySlot: 'Evening',
    aiTone: 'friendly',
    language: 'Hinglish',
    reminderEnabled: true,
    compactMode: false,
    soundsEnabled: false,
    profileVisibility: 'private',
  }), [])

  const [prefs, setPrefs] = useState<AccountPreferences>(defaultPrefs)
  const [prefsMessage, setPrefsMessage] = useState('')
  const [prefsError, setPrefsError] = useState('')

  const preferencesStorageKey = useMemo(
    () => `jee_study_buddy_account_preferences_v1_${user?.id || 'anon'}`,
    [user?.id]
  )

  const joinedOn = useMemo(() => {
    if (!user?.createdAt) return 'Not available'
    const date = new Date(user.createdAt)
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
  }, [user?.createdAt])

  const accountAgeDays = useMemo(() => {
    if (!user?.createdAt) return 0
    const diff = Date.now() - new Date(user.createdAt).getTime()
    if (!Number.isFinite(diff) || diff < 0) return 0
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
  }, [user?.createdAt])

  const reauthTimeLeftMs = reauthDeadlineMs ? Math.max(0, reauthDeadlineMs - nowMs) : 0
  const hasActiveReauth = reauthTimeLeftMs > 0
  const canSaveProfile = profileName.trim().length >= 2 && profileName.trim().length <= 60

  useEffect(() => {
    setProfileName(user?.name || '')
    setProfileNickname(user?.nickname || '')
    setProfileAvatar(user?.avatar || '')
  }, [user?.avatar, user?.name, user?.nickname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(preferencesStorageKey)
      if (!raw) {
        setPrefs(defaultPrefs)
        return
      }
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        setPrefs(defaultPrefs)
        return
      }
      setPrefs({ ...defaultPrefs, ...parsed })
    } catch {
      setPrefs(defaultPrefs)
    }
  }, [defaultPrefs, preferencesStorageKey])

  useEffect(() => {
    if (!reauthDeadlineMs) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [reauthDeadlineMs])

  const handleSaveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setProfileError('')
    setProfileMessage('')

    if (!user) {
      setProfileError('Login required.')
      return
    }
    if (!canSaveProfile) {
      setProfileError('Name must be between 2 and 60 characters.')
      return
    }

    setSavingProfile(true)
    try {
      const data = await api.auth.updateProfile({
        name: profileName.trim(),
        nickname: profileNickname.trim(),
        avatar: profileAvatar.trim(),
      })
      if (data?.user) {
        onUserUpdated(data.user)
        setProfileName(data.user.name || '')
        setProfileNickname(data.user.nickname || '')
        setProfileAvatar(data.user.avatar || '')
      }
      setProfileMessage('Profile updated successfully.')
    } catch (err: any) {
      setProfileError(err?.message || 'Unable to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setProfileError('')
    setProfileMessage('')

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type.toLowerCase())) {
      setProfileError('Only JPG, JPEG, and PNG files are allowed.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      setProfileError('Image too large. Please upload file up to 1MB.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        setProfileError('Unable to read image file.')
        return
      }
      setProfileAvatar(dataUrl)
      setProfileMessage('Image selected. Click Save Profile to apply.')
    }
    reader.onerror = () => {
      setProfileError('Unable to read image file.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleSavePreferences = () => {
    setPrefsError('')
    setPrefsMessage('')
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(preferencesStorageKey, JSON.stringify(prefs))
      }
      setPrefsMessage('Preferences saved on this device.')
    } catch {
      setPrefsError('Unable to save preferences on this device.')
    }
  }

  const handleResetPreferences = () => {
    setPrefs(defaultPrefs)
    setPrefsMessage('Preferences reset. Click Save Preferences to apply.')
    setPrefsError('')
  }

  const handleReauth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (!reauthPassword) {
      setPasswordError('Re-login password required.')
      return
    }

    setReauthLoading(true)
    try {
      const data = await api.auth.reauthPassword(reauthPassword)
      const expiresAt = new Date(data?.reauthExpiresAt || '').getTime()
      setReauthDeadlineMs(Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3 * 60 * 1000)
      setReauthPassword('')
      setPasswordMessage('Re-login verified. You can change password in next 3 minutes.')
    } catch (err: any) {
      setPasswordError(err?.message || 'Re-login verification failed.')
      setReauthDeadlineMs(null)
    } finally {
      setReauthLoading(false)
    }
  }

  const handlePasswordChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (!user || user.isGuest) {
      setPasswordError('Guest account password change is not available.')
      return
    }
    if (!hasActiveReauth) {
      setPasswordError('Please re-login first. You get 3 minutes to update password.')
      return
    }
    if (!newPassword || !confirmPassword) {
      setPasswordError('Please fill new password and confirm password.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.')
      return
    }

    setUpdatingPassword(true)
    try {
      await api.auth.changePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setReauthDeadlineMs(null)
      setPasswordMessage('Password updated successfully.')
    } catch (err: any) {
      if (err?.code === 'REAUTH_REQUIRED') {
        setReauthDeadlineMs(null)
      }
      setPasswordError(err?.message || 'Unable to update password.')
    } finally {
      setUpdatingPassword(false)
    }
  }

  const handleCopyUserId = async () => {
    if (!user?.id || typeof navigator === 'undefined') return
    try {
      await navigator.clipboard.writeText(user.id)
      setProfileMessage('User ID copied to clipboard.')
      setProfileError('')
    } catch {
      setProfileError('Unable to copy User ID.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            {getAvatarSource(user) ? (
              <img
                src={getAvatarSource(user)}
                alt="Account avatar"
                className="w-14 h-14 rounded-full object-cover border border-slate-600"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-linear-to-br from-blue-400 to-purple-400 flex items-center justify-center text-xl font-bold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold">My Account</h2>
              <p className="text-sm text-slate-300">Manage profile, preferences, privacy, and security in one place.</p>
            </div>
          </div>
          <div className="text-sm text-slate-200">
            <p>{user?.nickname ? `@${user.nickname}` : '@nickname_not_set'}</p>
            <p className="text-slate-300">{user?.email || 'no-email'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 xl:col-span-1">
          <h3 className="text-lg font-semibold mb-4">Edit Profile</h3>
          <form className="space-y-3" onSubmit={handleSaveProfile}>
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-700/20 p-3">
              {profileAvatar.trim() ? (
                <img
                  src={profileAvatar}
                  alt="Profile preview"
                  className="w-14 h-14 rounded-full object-cover border border-slate-600"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-linear-to-br from-blue-400 to-purple-400 flex items-center justify-center text-xl font-bold">
                  {profileName.trim().charAt(0).toUpperCase() || user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/70 hover:bg-slate-600/70 cursor-pointer text-sm">
                  <Upload className="w-4 h-4" />
                  Upload JPG/PNG
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={handleAvatarFileChange}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setProfileAvatar('')}
                  className="text-xs text-blue-300 hover:text-blue-200"
                >
                  Use default email photo
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Full name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <input
              type="text"
              placeholder="Nickname (a-z, 0-9, _)"
              value={profileNickname}
              onChange={(e) => setProfileNickname(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <input
              type="url"
              placeholder="Avatar image URL (optional, http/https)"
              value={profileAvatar}
              onChange={(e) => setProfileAvatar(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <button
              type="submit"
              disabled={savingProfile || !canSaveProfile}
              className="w-full bg-blue-500 text-white py-3 rounded-xl font-medium hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingProfile ? 'Saving Profile...' : 'Save Profile'}
            </button>
            {profileError && <p className="text-sm text-red-300">{profileError}</p>}
            {profileMessage && <p className="text-sm text-green-300">{profileMessage}</p>}
          </form>
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 xl:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Study Preferences</h3>
          <p className="text-sm text-slate-300">
            Yahan se aap apni study strategy, AI style, language aur goals customize kar sakte ho.
          </p>
          <p className="text-xs text-slate-400 mt-1 mb-3">
            Note: Abhi ye preferences device-level par save hoti hain (local storage).
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              {prefs.targetExam}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              Target {prefs.targetYear}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              {prefs.dailyQuestionGoal} Q/day
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              {prefs.weeklyMockGoal} mocks/week
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              AI: {prefs.aiTone}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-700/50 border border-slate-600">
              {prefs.language}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={prefs.targetExam}
              onChange={(e) => setPrefs(prev => ({ ...prev, targetExam: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            >
              <option>JEE Main</option>
              <option>JEE Advanced</option>
              <option>BITSAT</option>
              <option>NEET</option>
            </select>
            <input
              type="text"
              value={prefs.targetYear}
              onChange={(e) => setPrefs(prev => ({ ...prev, targetYear: e.target.value }))}
              placeholder="Target Year"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <input
              type="number"
              min={5}
              max={300}
              value={prefs.dailyQuestionGoal}
              onChange={(e) => setPrefs(prev => ({ ...prev, dailyQuestionGoal: Number(e.target.value || 0) }))}
              placeholder="Daily Question Goal"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <input
              type="number"
              min={1}
              max={14}
              value={prefs.weeklyMockGoal}
              onChange={(e) => setPrefs(prev => ({ ...prev, weeklyMockGoal: Number(e.target.value || 0) }))}
              placeholder="Weekly Mock Goal"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            />
            <select
              value={prefs.preferredSubject}
              onChange={(e) => setPrefs(prev => ({ ...prev, preferredSubject: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            >
              <option>Physics</option>
              <option>Chemistry</option>
              <option>Mathematics</option>
              <option>Biology</option>
            </select>
            <select
              value={prefs.studySlot}
              onChange={(e) => setPrefs(prev => ({ ...prev, studySlot: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            >
              <option>Early Morning</option>
              <option>Morning</option>
              <option>Afternoon</option>
              <option>Evening</option>
              <option>Night</option>
            </select>
            <select
              value={prefs.aiTone}
              onChange={(e) => setPrefs(prev => ({ ...prev, aiTone: e.target.value as AIMode }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            >
              <option value="friendly">AI Tone: Friendly</option>
              <option value="exam">AI Tone: Exam</option>
              <option value="strict">AI Tone: Strict</option>
            </select>
            <select
              value={prefs.language}
              onChange={(e) => setPrefs(prev => ({ ...prev, language: e.target.value as AccountPreferences['language'] }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-700/20 px-4 py-3 text-sm">
              <span>Study reminders</span>
              <input
                type="checkbox"
                checked={prefs.reminderEnabled}
                onChange={(e) => setPrefs(prev => ({ ...prev, reminderEnabled: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-700/20 px-4 py-3 text-sm">
              <span>Compact mode</span>
              <input
                type="checkbox"
                checked={prefs.compactMode}
                onChange={(e) => setPrefs(prev => ({ ...prev, compactMode: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-700/20 px-4 py-3 text-sm">
              <span>Sound effects</span>
              <input
                type="checkbox"
                checked={prefs.soundsEnabled}
                onChange={(e) => setPrefs(prev => ({ ...prev, soundsEnabled: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-700/20 px-4 py-3 text-sm">
              <span>Profile visibility</span>
              <select
                value={prefs.profileVisibility}
                onChange={(e) => setPrefs(prev => ({ ...prev, profileVisibility: e.target.value as AccountPreferences['profileVisibility'] }))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <h4 className="text-sm font-semibold mb-2">What each setting means</h4>
            <ul className="space-y-2 text-xs text-slate-300">
              <li><span className="text-white font-medium">Target Exam:</span> Main focus exam for your preparation flow.</li>
              <li><span className="text-white font-medium">Target Year:</span> Jis saal aap exam dene wale ho.</li>
              <li><span className="text-white font-medium">Daily Question Goal:</span> Roz ka practice target (questions count).</li>
              <li><span className="text-white font-medium">Weekly Mock Goal:</span> Har week kitne full/sectional mocks dene hain.</li>
              <li><span className="text-white font-medium">Preferred Subject:</span> Priority subject for recommendations.</li>
              <li><span className="text-white font-medium">Study Slot:</span> Aapka preferred study time window.</li>
              <li><span className="text-white font-medium">AI Tone:</span> AI ka response style (friendly, exam, strict).</li>
              <li><span className="text-white font-medium">Language:</span> Interface aur assistant response preference.</li>
              <li><span className="text-white font-medium">Reminders/Compact/Sounds:</span> Learning experience controls.</li>
              <li><span className="text-white font-medium">Profile Visibility:</span> Public ya private display mode.</li>
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <button
              type="button"
              onClick={handleSavePreferences}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              Save Preferences
            </button>
            <button
              type="button"
              onClick={handleResetPreferences}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700/40 transition-colors"
            >
              Reset Defaults
            </button>
          </div>
          {prefsError && <p className="text-sm text-red-300 mt-2">{prefsError}</p>}
          {prefsMessage && <p className="text-sm text-green-300 mt-2">{prefsMessage}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Security</h3>
          {user?.isGuest ? (
            <p className="text-sm text-slate-300">
              Guest account has limited controls. Create/login with a registered account to manage security.
            </p>
          ) : (
            <div className="space-y-4">
              <form className="space-y-3" onSubmit={handleReauth}>
                <p className="text-xs text-slate-300">
                  Step 1: Re-login with your current password. This unlocks password update for 3 minutes.
                </p>
                <input
                  type="password"
                  placeholder="Login password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
                />
                <button
                  type="submit"
                  disabled={reauthLoading}
                  className="w-full bg-slate-700/80 text-white py-3 rounded-xl font-medium hover:bg-slate-600/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reauthLoading ? 'Verifying...' : 'Re-login to Continue'}
                </button>
              </form>

              {hasActiveReauth ? (
                <p className="text-sm text-blue-300">Verified. Time left: {formatCountdown(reauthTimeLeftMs)}</p>
              ) : (
                <p className="text-sm text-slate-400">Re-login expires in 3 minutes if not used.</p>
              )}

              <form className="space-y-3" onSubmit={handlePasswordChange}>
                <p className="text-xs text-slate-300">Step 2: Set your new password.</p>
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:border-blue-400 focus:outline-hidden transition-colors"
                />
                {passwordError && <p className="text-sm text-red-300">{passwordError}</p>}
                {passwordMessage && <p className="text-sm text-green-300">{passwordMessage}</p>}
                <button
                  type="submit"
                  disabled={updatingPassword || !hasActiveReauth}
                  className="w-full bg-linear-to-r from-blue-500 to-purple-500 text-white py-3 rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 space-y-4">
          <h3 className="text-lg font-semibold">Account Insights</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Email</span>
              <span className="font-medium break-all text-right">{user?.email || 'Not available'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Role</span>
              <span className="font-medium capitalize">{user?.role || 'student'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Account type</span>
              <span className="font-medium">{user?.isGuest ? 'Guest' : 'Registered'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Joined</span>
              <span className="font-medium text-right">{joinedOn}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Account age</span>
              <span className="font-medium">{accountAgeDays} days</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">User ID</span>
              <span className="font-mono text-xs text-right break-all">{user?.id || 'N/A'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleCopyUserId}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700/40 transition-colors"
            >
              Copy User ID
            </button>
            <button
              type="button"
              onClick={() => {
                setProfileName(user?.name || '')
                setProfileNickname(user?.nickname || '')
                setProfileAvatar(user?.avatar || '')
                setProfileMessage('Form reset to current account values.')
                setProfileError('')
              }}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700/40 transition-colors"
            >
              Reset Profile Form
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Revision Component
function Revision({ user }: { user: User | null }) {
  const REVISION_STORAGE_KEY_BASE = 'jee_study_buddy_revision_history_v1'
  const revisionStorageKey = useMemo(
    () => `${REVISION_STORAGE_KEY_BASE}_${user?.id || 'anon'}`,
    [user?.id]
  )
  type PdfStyle = 'clean' | 'classic' | 'notebook'
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [examType, setExamType] = useState<'JEE Main' | 'JEE Advanced'>('JEE Main')
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('clean')
  const [pdfDownloadVisible, setPdfDownloadVisible] = useState(false)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const [revisionHistory, setRevisionHistory] = useState<RevisionEntry[]>([])
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null)
  const [revisionHydrated, setRevisionHydrated] = useState(false)
  const revisionSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef<HTMLDivElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const previewContentRef = useRef<HTMLDivElement | null>(null)
  const previewSectionRef = useRef<HTMLDivElement | null>(null)

  const orderedRevisionHistory = [...revisionHistory].sort((a, b) => b.updatedAt - a.updatedAt)

  const normalizeRevisionEntries = useCallback((raw: any): RevisionEntry[] => {
    if (!Array.isArray(raw)) return []

    return raw.map((entry: any) => {
      const createdAt = typeof entry?.createdAt === 'number' ? entry.createdAt : Date.now()
      const updatedAt = typeof entry?.updatedAt === 'number' ? entry.updatedAt : createdAt
      return {
        id: typeof entry?.id === 'string' && entry.id ? entry.id : `rev_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
        subject: typeof entry?.subject === 'string' ? entry.subject : '',
        chapter: typeof entry?.chapter === 'string' ? entry.chapter : '',
        examType: entry?.examType === 'JEE Advanced' ? 'JEE Advanced' : 'JEE Main',
        notes: typeof entry?.notes === 'string' ? entry.notes : '',
        createdAt,
        updatedAt,
      } as RevisionEntry
    }).filter((entry: RevisionEntry) => entry.subject && entry.chapter && entry.notes)
  }, [])

  const handlePreviewScroll = (event: UIEvent<HTMLDivElement>) => {
    if (pdfDownloadVisible) return
    const target = event.currentTarget
    if (target.scrollTop > 60 || target.scrollTop + target.clientHeight >= target.scrollHeight - 40) {
      setPdfDownloadVisible(true)
    }
  }

  const handleDownloadPdf = async () => {
    if (typeof window === 'undefined') return
    if (!previewContentRef.current) return
    if (pdfDownloading) return
    setPdfDownloading(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf')
      ])

      const backgroundColor = pdfStyle === 'notebook' ? '#fffdfa' : '#ffffff'
      const canvas = await html2canvas(previewContentRef.current, {
        scale: 2,
        backgroundColor,
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'pt', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 24
      const imgWidth = pageWidth - margin * 2
      const imgHeight = canvas.height * (imgWidth / canvas.width)

      let position = margin
      let remaining = imgHeight
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
        remaining -= pageHeight - margin * 2
        if (remaining > 0) {
          pdf.addPage()
          position = margin - (imgHeight - remaining)
        }
      }

      const safeTitle = `${subject} - ${chapter} (${examType})`.replace(/[\\/:*?"<>|]+/g, '-')
      pdf.save(`${safeTitle}.pdf`)
    } catch (error) {
      console.error('PDF download failed:', error)
    } finally {
      setPdfDownloading(false)
    }
  }

  useEffect(() => {
    setPdfDownloadVisible(false)
  }, [notes, pdfStyle])

  useEffect(() => {
    const container = previewScrollRef.current
    if (!container) return
    if (container.scrollHeight <= container.clientHeight + 4) {
      setPdfDownloadVisible(true)
    }
  }, [notes, pdfStyle])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const hydrate = async () => {
      setRevisionHydrated(false)
      let normalized: RevisionEntry[] = []

      if (user?.id) {
        try {
          const snapshot = await getDoc(doc(firebaseDb, 'revisionHistory', user.id))
          if (snapshot.exists()) {
            const data = snapshot.data()
            const rawEntries = Array.isArray(data?.entries) ? data.entries : data
            normalized = normalizeRevisionEntries(rawEntries)
          }
        } catch {
          normalized = []
        }
      }

      if (normalized.length === 0) {
        try {
          const raw = window.localStorage.getItem(revisionStorageKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            normalized = normalizeRevisionEntries(parsed)
          }
        } catch {
          normalized = []
        }
      }

      if (!cancelled) {
        if (normalized.length === 0) {
          setRevisionHistory([])
          setActiveRevisionId(null)
          setNotes('')
          setRevisionHydrated(true)
          return
        }
        normalized.sort((a, b) => b.updatedAt - a.updatedAt)
        setRevisionHistory(normalized)
        const latest = normalized[0]
        setActiveRevisionId(latest.id)
        setSubject(latest.subject)
        setChapter(latest.chapter)
        setExamType(latest.examType)
        setNotes(latest.notes)
        setRevisionHydrated(true)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [normalizeRevisionEntries, revisionStorageKey, user?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!revisionHydrated) return
    if (revisionHistory.length === 0) {
      window.localStorage.removeItem(revisionStorageKey)
      return
    }
    window.localStorage.setItem(revisionStorageKey, JSON.stringify(revisionHistory))
  }, [revisionHistory, revisionStorageKey, revisionHydrated])

  useEffect(() => {
    if (!revisionHydrated || !user?.id) return

    if (revisionSaveRef.current) {
      clearTimeout(revisionSaveRef.current)
    }

    revisionSaveRef.current = setTimeout(() => {
      void setDoc(
        doc(firebaseDb, 'revisionHistory', user.id),
        {
          entries: revisionHistory.slice(0, 50),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
        // Firestore is best-effort; local storage remains the fallback.
      })
    }, 500)

    return () => {
      if (revisionSaveRef.current) {
        clearTimeout(revisionSaveRef.current)
      }
    }
  }, [revisionHistory, revisionHydrated, user?.id])

  const selectRevisionEntry = (entry: RevisionEntry) => {
    setActiveRevisionId(entry.id)
    setSubject(entry.subject)
    setChapter(entry.chapter)
    setExamType(entry.examType)
    setNotes(entry.notes)
  }

  const handleDeleteRevision = (entry: RevisionEntry) => {
    setRevisionHistory(prev => {
      const next = prev.filter(item => item.id !== entry.id)
      if (entry.id === activeRevisionId) {
        const fallback = next[0]
        if (fallback) {
          selectRevisionEntry(fallback)
        } else {
          setActiveRevisionId(null)
          setNotes('')
        }
      }
      return next
    })
  }

  const handleGenerate = async () => {
    if (!subject || !chapter) return

    setLoading(true)
    try {
      const data = await api.ai.revise(subject, chapter, examType)
      const notesText = typeof data?.notes === 'string' ? data.notes : ''
      setNotes(notesText)
      if (notesText) {
        const timestamp = Date.now()
        const newEntry: RevisionEntry = {
          id: `rev_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
          subject,
          chapter,
          examType,
          notes: notesText,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        setRevisionHistory(prev => [newEntry, ...prev].slice(0, 50))
        setActiveRevisionId(newEntry.id)
      }
    } catch (err: any) {
      setNotes(getGuestAiUpgradeMessage(err, 'Failed to generate notes. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Controls */}
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4">Generate Revision Notes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={subject}
            onChange={e => { setSubject(e.target.value); setChapter(''); setNotes(''); setActiveRevisionId(null) }}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">Select Subject</option>
            {Object.keys(SUBJECTS).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={chapter}
            onChange={e => { setChapter(e.target.value); setNotes(''); setActiveRevisionId(null) }}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            disabled={!subject}
          >
            <option value="">Select Chapter</option>
            {subject && SUBJECTS[subject as keyof typeof SUBJECTS].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={examType}
            onChange={e => setExamType(e.target.value as any)}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="JEE Main">JEE Main</option>
            <option value="JEE Advanced">JEE Advanced</option>
          </select>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!subject || !chapter || loading}
          className="mt-4 w-full py-3 bg-linear-to-r from-blue-500 to-purple-500 rounded-xl font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
              Generating Notes...
            </>
          ) : (
            <>
              <FileText className="w-5 h-5" />
              Generate Revision Notes
            </>
          )}
        </button>
      </div>

      {revisionHistory.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Revision History</h3>
            <span className="text-xs text-slate-400">{revisionHistory.length} saved</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-auto pr-1">
            {orderedRevisionHistory.map(entry => (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => selectRevisionEntry(entry)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectRevisionEntry(entry)
                  }
                }}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  entry.id === activeRevisionId
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{entry.subject} - {entry.chapter}</p>
                  <p className="text-xs text-slate-400">
                    {entry.examType} • {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleDeleteRevision(entry) }}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  aria-label="Delete revision note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes Display */}
      {notes && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold">
              {subject} - {chapter}
              <span className="ml-2 text-sm font-normal text-slate-400">({examType})</span>
            </h3>
            <button
              type="button"
              onClick={() => previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-700/60 hover:bg-slate-600 rounded-lg transition-colors text-sm"
              aria-label="Preview PDF"
            >
              <FileText className="w-4 h-4" />
              Preview PDF
            </button>
          </div>
          <div ref={notesRef} className="prose prose-invert max-w-none">
            <MathText text={notes} />
          </div>
        </motion.div>
      )}

      {notes && (
        <motion.div
          ref={previewSectionRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">PDF Preview</h3>
              <p className="text-sm text-slate-400">
                Scroll the preview below to unlock the download button.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-300">PDF Style</label>
              <select
                value={pdfStyle}
                onChange={e => setPdfStyle(e.target.value as PdfStyle)}
                className="bg-slate-900/60 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm"
              >
                <option value="clean">Clean (default)</option>
                <option value="classic">Classic</option>
                <option value="notebook">Notebook</option>
              </select>
            </div>
          </div>
          <div
            ref={previewScrollRef}
            onScroll={handlePreviewScroll}
            className="mt-4 max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-700 bg-white"
          >
            <div
              ref={previewContentRef}
              className={`pdf-preview px-10 py-10 text-slate-900 ${
                pdfStyle === 'classic'
                  ? 'font-serif'
                  : pdfStyle === 'notebook'
                    ? 'bg-[#fffdfa]'
                    : 'font-sans'
              }`}
            >
              <style>{`
                .pdf-preview h1 { font-size: 24px; margin: 0 0 12px; }
                .pdf-preview h2 { font-size: 20px; margin: 18px 0 10px; }
                .pdf-preview h3 { font-size: 18px; margin: 16px 0 8px; }
                .pdf-preview p { margin: 8px 0; line-height: 1.65; }
                .pdf-preview ul { margin: 8px 0 12px 18px; }
                .pdf-preview li { margin: 4px 0; }
                .pdf-preview hr { border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0; }
                .pdf-preview pre { background: #f8fafc; padding: 12px; border-radius: 8px; overflow: auto; }
                .pdf-preview code { font-family: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
                .pdf-preview mjx-container { margin: 8px 0; }
              `}</style>
              <h1 className="text-2xl font-semibold mb-2">
                {subject} - {chapter}
                <span className="ml-2 text-sm font-normal text-slate-500">({examType})</span>
              </h1>
              <div className="max-w-none">
                <MathText text={notes} />
              </div>
            </div>
          </div>
          <AnimatePresence>
            {pdfDownloadVisible && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="sticky bottom-0 mt-4"
              >
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={pdfDownloading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors text-white font-medium"
                >
                  {pdfDownloading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      Preparing PDF...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download PDF
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  )
}

// Practice Component
function Practice({ user }: { user: User | null }) {
  const PRACTICE_STORAGE_KEY_BASE = 'jee_study_buddy_practice_history_v1'
  const practiceStorageKey = useMemo(
    () => `${PRACTICE_STORAGE_KEY_BASE}_${user?.id || 'anon'}`,
    [user?.id]
  )
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [hint, setHint] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState(Date.now())
  const [mode] = useState<AIMode>('exam')
  const [loadNotice, setLoadNotice] = useState('')
  const [practiceHistory, setPracticeHistory] = useState<PracticeSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [review, setReview] = useState<PracticeReview | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewTab, setReviewTab] = useState<'summary' | 'mistake' | 'alternative'>('summary')
  const [monitorStats, setMonitorStats] = useState<{ attempted: number; correct: number; accuracy: number; avgTime: number }>({
    attempted: 0,
    correct: 0,
    accuracy: 0,
    avgTime: 0
  })
  const [monitorHistory, setMonitorHistory] = useState<Array<{ isCorrect: boolean; timeTaken: number }>>([])
  const [practiceSelectedIds, setPracticeSelectedIds] = useState<string[]>([])
  const [practiceSolveMode, setPracticeSolveMode] = useState(false)
  const [practiceSolveIndex, setPracticeSolveIndex] = useState(0)
  const [practiceSolveSelectedAnswer, setPracticeSolveSelectedAnswer] = useState<number | null>(null)
  const [practiceSolveShowResult, setPracticeSolveShowResult] = useState(false)
  const [practiceSolveResult, setPracticeSolveResult] = useState<any>(null)
  const [practiceSolveStartTime, setPracticeSolveStartTime] = useState(Date.now())
  const [useAiQuestions, setUseAiQuestions] = useState(true)

  const orderedPracticeHistory = [...practiceHistory].sort((a, b) => b.updatedAt - a.updatedAt)
  const currentQuestion = questions[currentIndex] || null
  const options = currentQuestion ? parseQuestionOptions(currentQuestion.options) : []
  const practiceSelectedQuestions = useMemo(() => {
    if (practiceSelectedIds.length === 0) return []
    const selectedSet = new Set(practiceSelectedIds)
    return questions.filter(q => selectedSet.has(q.id))
  }, [questions, practiceSelectedIds])

  const normalizePracticeSessions = useCallback((raw: any): PracticeSession[] => {
    if (!Array.isArray(raw)) return []
    return raw.map((entry: any) => {
      const createdAt = typeof entry?.createdAt === 'number' ? entry.createdAt : Date.now()
      const updatedAt = typeof entry?.updatedAt === 'number' ? entry.updatedAt : createdAt
      return {
        id: typeof entry?.id === 'string' && entry.id ? entry.id : `ps_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
        subject: typeof entry?.subject === 'string' ? entry.subject : '',
        chapter: typeof entry?.chapter === 'string' ? entry.chapter : '',
        difficulty: typeof entry?.difficulty === 'string' ? entry.difficulty : '',
        questions: Array.isArray(entry?.questions) ? entry.questions : [],
        createdAt,
        updatedAt
      } as PracticeSession
    }).filter((entry: PracticeSession) => entry.questions.length > 0)
  }, [])

  const saveSession = (list: Question[]) => {
    const timestamp = Date.now()
    const newSession: PracticeSession = {
      id: `ps_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      subject,
      chapter,
      difficulty,
      questions: list,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    setPracticeHistory(prev => [newSession, ...prev].slice(0, 50))
    setActiveSessionId(newSession.id)
  }

  const loadQuestions = async () => {
    setLoading(true)
    setLoadNotice('')
    try {
      const preferAi = difficulty === 'Advanced' || difficulty === 'Irodov'
      const allowAi = useAiQuestions || preferAi
      const data = await api.practice.questions(subject, chapter, difficulty, { allowAi, preferAi })
      const list = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : []
      setQuestions(list)
      setCurrentIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setResult(null)
      setHint('')
      setShowHint(false)
      setReview(null)
      setReviewLoading(false)
      setReviewTab('summary')
      setMonitorHistory([])
      setMonitorStats({ attempted: 0, correct: 0, accuracy: 0, avgTime: 0 })
      setPracticeSelectedIds([])
      setPracticeSolveMode(false)
      setPracticeSolveIndex(0)
      setPracticeSolveSelectedAnswer(null)
      setPracticeSolveShowResult(false)
      setPracticeSolveResult(null)
      setPracticeSolveStartTime(Date.now())

      if (list.length > 0) {
        saveSession(list)
      }

      if (data?.source === 'ai') {
        setLoadNotice('Loaded AI-generated questions for this selection.')
      } else if (list.length === 0) {
        setLoadNotice('No questions found for this selection. Try changing filters.')
      } else if (data?.aiError) {
        setLoadNotice(`AI fallback failed: ${data.aiError}`)
      }
    } catch (err: any) {
      setLoadNotice(getGuestAiUpgradeMessage(err, 'Failed to load questions. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const togglePracticeSelected = (id: string) => {
    setPracticeSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const selectAllPractice = () => {
    setPracticeSelectedIds(questions.map(q => q.id))
  }

  const clearPracticeSelected = () => {
    setPracticeSelectedIds([])
  }

  const startPracticeSolve = () => {
    if (practiceSelectedIds.length === 0) return
    setPracticeSolveMode(true)
    setPracticeSolveIndex(0)
    setPracticeSolveSelectedAnswer(null)
    setPracticeSolveShowResult(false)
    setPracticeSolveResult(null)
    setPracticeSolveStartTime(Date.now())
  }

  const exitPracticeSolve = () => {
    setPracticeSolveMode(false)
    setPracticeSolveIndex(0)
    setPracticeSolveSelectedAnswer(null)
    setPracticeSolveShowResult(false)
    setPracticeSolveResult(null)
    setPracticeSolveStartTime(Date.now())
  }

  const selectPracticeSession = (session: PracticeSession) => {
    setActiveSessionId(session.id)
    setSubject(session.subject || '')
    setChapter(session.chapter || '')
    setDifficulty(session.difficulty || '')
    setQuestions(session.questions || [])
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setResult(null)
    setHint('')
    setShowHint(false)
    setReview(null)
    setReviewLoading(false)
    setReviewTab('summary')
    setPracticeSelectedIds([])
    setPracticeSolveMode(false)
  }

  const handleDeletePracticeSession = (sessionId: string) => {
    setPracticeHistory(prev => {
      const next = prev.filter(item => item.id !== sessionId)
      if (sessionId === activeSessionId) {
        const fallback = next[0]
        if (fallback) {
          selectPracticeSession(fallback)
        } else {
          setActiveSessionId(null)
          setQuestions([])
          setCurrentIndex(0)
          setSelectedAnswer(null)
          setShowResult(false)
          setResult(null)
          setHint('')
          setShowHint(false)
        }
      }
      return next
    })
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(practiceStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const normalized = normalizePracticeSessions(parsed)
      setPracticeHistory(normalized)
      if (normalized.length > 0) {
        selectPracticeSession(normalized[0])
      }
    } catch {
      // ignore
    }
  }, [practiceStorageKey, normalizePracticeSessions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (practiceHistory.length === 0) {
      window.localStorage.removeItem(practiceStorageKey)
      return
    }
    window.localStorage.setItem(practiceStorageKey, JSON.stringify(practiceHistory))
  }, [practiceHistory, practiceStorageKey])
  const handleSelectAnswer = (index: number) => {
    if (showResult) return
    setSelectedAnswer(index)
  }

  const handleSubmit = async () => {
    if (!currentQuestion || selectedAnswer === null) return

    const timeTaken = Math.round((Date.now() - questionStartTime) / 1000)

    try {
      const data = await api.practice.submit(currentQuestion.id, selectedAnswer.toString(), timeTaken)
      setResult(data)
      setShowResult(true)

      const nextHistory = [...monitorHistory, { isCorrect: data.isCorrect, timeTaken }]
      const attempted = nextHistory.length
      const correct = nextHistory.filter(entry => entry.isCorrect).length
      const totalTime = nextHistory.reduce((sum, entry) => sum + entry.timeTaken, 0)
      const accuracy = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : 0
      const avgTime = attempted > 0 ? Math.round(totalTime / attempted) : 0
      const nextStats = { attempted, correct, accuracy, avgTime }
      setMonitorHistory(nextHistory)
      setMonitorStats(nextStats)

      setReviewLoading(true)
      setReview(null)
      setReviewTab('summary')
      try {
        const reviewPayload = {
          question: currentQuestion.question,
          options: parseQuestionOptions(currentQuestion.options),
          correctAnswer: data.correctAnswer ?? '',
          userAnswer: selectedAnswer,
          isCorrect: data.isCorrect,
          subject: currentQuestion.subject,
          chapter: currentQuestion.chapter,
          difficulty: currentQuestion.difficulty,
          solution: data.solution || '',
          timeTaken,
          stats: nextStats,
          mode
        }
        const reviewData = await api.practice.review(reviewPayload)
        setReview(reviewData.review || null)
      } catch (error: any) {
        const aiLimitMessage = getGuestAiUpgradeMessage(error, '')
        if (error?.code === 'GUEST_AI_FEATURE_LIMIT' || error?.code === 'GUEST_EXPIRED') {
          setReview({
            friendlyMessage: aiLimitMessage,
            mistake: 'Guest AI review limit reached.',
            fix: 'Please log in to continue AI review.',
            alternativeApproach: 'Sign in for unlimited review and alternate solution guidance.',
          })
        } else {
          setReview({
            friendlyMessage: 'Keep going. Your consistency matters more than a single result.',
            mistake: data.isCorrect ? 'No mistake here. Focus on speed and clean presentation.' : 'There was likely a conceptual or algebraic slip.',
            fix: 'Revisit the core formula and re-derive the steps cleanly.',
            alternativeApproach: 'Try an alternative method (substitution/graphical/energy-based) to validate the answer.'
          })
        }
      } finally {
        setReviewLoading(false)
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const handlePracticeSolveSubmit = async () => {
    const solveQuestion = practiceSelectedQuestions[practiceSolveIndex]
    if (!solveQuestion || practiceSolveSelectedAnswer === null) return

    const timeTaken = Math.round((Date.now() - practiceSolveStartTime) / 1000)

    try {
      const data = await api.practice.submit(solveQuestion.id, practiceSolveSelectedAnswer.toString(), timeTaken)
      setPracticeSolveResult(data)
      setPracticeSolveShowResult(true)
    } catch (err) {
      console.error(err)
    }
  }

  const handlePracticeSolveNext = () => {
    if (practiceSolveIndex < practiceSelectedQuestions.length - 1) {
      setPracticeSolveIndex(prev => prev + 1)
      setPracticeSolveSelectedAnswer(null)
      setPracticeSolveShowResult(false)
      setPracticeSolveResult(null)
      setPracticeSolveStartTime(Date.now())
    }
  }

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setResult(null)
      setHint('')
      setShowHint(false)
      setReview(null)
      setReviewLoading(false)
      setReviewTab('summary')
      setQuestionStartTime(Date.now())
    }
  }

  const getHint = async () => {
    if (!currentQuestion) return
    try {
      const data = await api.ai.hint(currentQuestion.question, currentQuestion.subject, mode)
      setHint(data.hint)
      setShowHint(true)
    } catch (err: any) {
      setHint(getGuestAiUpgradeMessage(err, 'Unable to generate hint.'))
      setShowHint(true)
    }
  }

  const getSolveOptionClass = (index: number, correctIndex: string) => {
    if (practiceSolveShowResult) {
      if (index.toString() === correctIndex) {
        return 'bg-green-500/20 border border-green-500'
      }
      if (practiceSolveSelectedAnswer === index) {
        return 'bg-red-500/20 border border-red-500'
      }
      return 'bg-slate-700/30 border border-slate-600'
    }
    return practiceSolveSelectedAnswer === index
      ? 'bg-blue-500/20 border border-blue-500'
      : 'bg-slate-700/30 border border-slate-600 hover:border-slate-500'
  }

  const getSolveBadgeClass = (index: number, correctIndex: string) => {
    if (practiceSolveShowResult && index.toString() === correctIndex) {
      return 'bg-green-500 text-white'
    }
    if (practiceSolveSelectedAnswer === index) {
      return 'bg-blue-500 text-white'
    }
    return 'bg-slate-600'
  }

  if (practiceSolveMode) {
    const solveQuestion = practiceSelectedQuestions[practiceSolveIndex]
    const solveOptions = solveQuestion ? parseQuestionOptions(solveQuestion.options) : []
    const solveCorrectAnswer = practiceSolveResult?.correctAnswer
    const solveCorrectAnswerIndex = solveCorrectAnswer !== undefined ? String(solveCorrectAnswer) : ''
    const solveIsCorrect = practiceSolveResult?.isCorrect

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">Selected Practice Questions</p>
            <h3 className="text-lg font-semibold">{subject || 'All Subjects'}</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">
              {practiceSelectedQuestions.length > 0 ? `${practiceSolveIndex + 1} / ${practiceSelectedQuestions.length}` : '0 / 0'}
            </span>
            <button
              onClick={exitPracticeSolve}
              className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60"
            >
              Back to Practice
            </button>
          </div>
        </div>

        {solveQuestion ? (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex items-center gap-4 mb-4">
              <span className={`px-3 py-1 rounded-full text-sm ${
                solveQuestion.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                solveQuestion.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {solveQuestion.difficulty}
              </span>
              <span className="text-slate-400 text-sm">
                {solveQuestion.subject} - {solveQuestion.chapter}
              </span>
            </div>

            <div className="text-lg mb-6 p-4 bg-slate-700/30 rounded-xl">
              <MathText text={solveQuestion.question} />
            </div>

            {solveOptions.length > 0 && (
              <div className="space-y-3 mb-6">
                {solveOptions.map((option: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setPracticeSolveSelectedAnswer(i)}
                    disabled={practiceSolveShowResult}
                    className={`w-full p-4 rounded-xl text-left transition-all flex items-center gap-3 ${getSolveOptionClass(i, solveCorrectAnswerIndex)}`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${getSolveBadgeClass(i, solveCorrectAnswerIndex)}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <MathText text={option} as="span" />
                  </button>
                ))}
              </div>
            )}

            {practiceSolveShowResult && practiceSolveResult && (
              <div className={`mb-6 p-4 rounded-xl ${
                solveIsCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {solveIsCorrect ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`font-medium ${solveIsCorrect ? 'text-green-400' : 'text-red-400'}`}>
                    {solveIsCorrect ? 'Correct!' : 'Incorrect'}
                  </span>
                </div>
                {practiceSolveResult.solution && (
                  <div className="mt-3 text-slate-300">
                    <p className="font-medium mb-1">Solution:</p>
                    <MathText text={practiceSolveResult.solution} />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              {!practiceSolveShowResult ? (
                <button
                  onClick={handlePracticeSolveSubmit}
                  disabled={practiceSolveSelectedAnswer === null}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
                >
                  Submit Answer
                </button>
              ) : (
                <button
                  onClick={handlePracticeSolveNext}
                  disabled={practiceSolveIndex >= practiceSelectedQuestions.length - 1}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  Next Question
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-2xl p-12 border border-slate-700 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-500" />
            <p className="text-slate-400">No selected questions. Go back and choose questions to solve.</p>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Filters */}
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={subject}
            onChange={e => { setSubject(e.target.value); setChapter('') }}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">All Subjects</option>
            {Object.keys(SUBJECTS).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {subject && (
            <select
              value={chapter}
              onChange={e => setChapter(e.target.value)}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="">All Chapters</option>
              {SUBJECTS[subject as keyof typeof SUBJECTS].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <select
            value={difficulty}
                      onChange={e => setDifficulty(e.target.value)}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
            <option value="Advanced">Advanced (JEE Adv)</option>
            {subject === 'Physics' && (
              <option value="Irodov">Irodov (Physics)</option>
            )}
          </select>

          <button
            onClick={loadQuestions}
            disabled={loading}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Load Questions
              </>
            )}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center space-x-2">
            <Switch id="ai-questions-toggle"
              checked={useAiQuestions}
              onCheckedChange={setUseAiQuestions}
              disabled={loading || difficulty === 'Irodov' || difficulty === 'Advanced'}
            />
            <label
              htmlFor="ai-questions-toggle"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Use AI questions (JEE level)
            </label>
          </div>
          {(difficulty === 'Irodov' || difficulty === 'Advanced') && (
            <span className="text-slate-400">
              Forced AI for {difficulty} mode.
            </span>
          )}
        </div>

      </div>

      {loadNotice && (
        <div className="px-4 py-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-100">
          {loadNotice}
        </div>
      )}

      {questions.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">Select Questions to Solve</p>
              <p className="text-xs text-slate-400">Choose specific questions for focus mode.</p>
            </div>
            <span className="text-xs text-slate-400">{practiceSelectedIds.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-auto pr-1">
            {questions.map((q, i) => {
              const active = practiceSelectedIds.includes(q.id)
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => togglePracticeSelected(q.id)}
                  className={`w-10 h-10 rounded-lg font-medium transition-all ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/50'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllPractice}
              className="px-3 py-1 rounded-full border border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-500"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={clearPracticeSelected}
              disabled={practiceSelectedIds.length === 0}
              className="px-3 py-1 rounded-full border border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-500 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={startPracticeSolve}
              disabled={practiceSelectedIds.length === 0}
              className="px-3 py-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Solve Selected
            </button>
          </div>
        </div>
      )}

      {practiceHistory.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Practice History</h3>
            <span className="text-xs text-slate-400">{practiceHistory.length} saved</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-auto pr-1">
            {orderedPracticeHistory.map(session => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => selectPracticeSession(session)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectPracticeSession(session)
                  }
                }}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  session.id === activeSessionId
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">
                    {session.subject || 'All Subjects'}{session.chapter ? ` - ${session.chapter}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">
                    {session.difficulty || 'All Difficulties'} • {session.questions.length} Qs • {new Date(session.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleDeletePracticeSession(session.id) }}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  aria-label="Delete practice session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Question Display */}
      {questions.length > 0 && currentQuestion && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          {/* Question Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm ${
                currentQuestion.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
                currentQuestion.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {currentQuestion.difficulty}
              </span>
              <span className="text-slate-400 text-sm">
                {currentQuestion.subject} - {currentQuestion.chapter}
              </span>
              {currentQuestion.pyqYear && (
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                  PYQ {currentQuestion.pyqYear}
                </span>
              )}
            </div>
            <span className="text-slate-400">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="text-lg mb-6 p-4 bg-slate-700/30 rounded-xl">
            <MathText text={currentQuestion.question} />
          </div>

          {/* Options */}
          {options.length > 0 && (
            <div className="space-y-3 mb-6">
              {options.map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => handleSelectAnswer(i)}
                  disabled={showResult}
                  className={`w-full p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                    showResult
                      ? i.toString() === result?.correctAnswer
                        ? 'bg-green-500/20 border border-green-500'
                        : selectedAnswer === i
                          ? 'bg-red-500/20 border border-red-500'
                          : 'bg-slate-700/30 border border-slate-600'
                      : selectedAnswer === i
                        ? 'bg-blue-500/20 border border-blue-500'
                        : 'bg-slate-700/30 border border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                    showResult && i.toString() === result?.correctAnswer
                      ? 'bg-green-500 text-white'
                      : selectedAnswer === i
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-600'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <MathText text={option} as="span" />
                </button>
              ))}
            </div>
          )}

          {/* Hint */}
          {showHint && hint && (
            <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-yellow-400 mb-2">
                <Lightbulb className="w-5 h-5" />
                <span className="font-medium">Hint</span>
              </div>
              <div className="text-slate-300">
                <MathText text={hint} />
              </div>
            </div>
          )}

          {/* Result */}
          {showResult && result && (
            <div className={`mb-6 p-4 rounded-xl ${
              result.isCorrect ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {result.isCorrect ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={`font-medium ${result.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                  {result.isCorrect ? 'Correct!' : 'Incorrect'}
                </span>
              </div>
              {result.solution && (
                <div className="mt-3 text-slate-300">
                  <p className="font-medium mb-1">Solution:</p>
                  <MathText text={result.solution} />
                </div>
              )}
            </div>
          )}

          {/* AI Review */}
          {showResult && (
            <div className="mb-6 p-5 bg-slate-800/60 border border-slate-700 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-lg font-semibold flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-400" />
                    AI Review Monitor
                  </h4>
                  <p className="text-xs text-slate-400">
                    Attempts: {monitorStats.attempted} • Accuracy: {monitorStats.accuracy}% • Avg Time: {monitorStats.avgTime}s
                  </p>
                </div>
                {reviewLoading && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"
                  />
                )}
              </div>

              <div className="flex gap-2 mb-4">
                {[
                  { id: 'summary', label: 'Summary' },
                  { id: 'mistake', label: 'Mistake & Fix' },
                  { id: 'alternative', label: 'Alternate Approach' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setReviewTab(tab.id as any)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      reviewTab === tab.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {!reviewLoading && review ? (
                <div className="space-y-3 text-slate-200">
                  {reviewTab === 'summary' && (
                    <div className="space-y-2">
                      <p className="text-slate-300">
                        <MathText text={review.friendlyMessage} />
                      </p>
                    </div>
                  )}
                  {reviewTab === 'mistake' && (
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">What went wrong</p>
                        <MathText text={review.mistake} />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">How to fix it</p>
                        <MathText text={review.fix} />
                      </div>
                    </div>
                  )}
                  {reviewTab === 'alternative' && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Alternate approach</p>
                      <MathText text={review.alternativeApproach} />
                    </div>
                  )}
                </div>
              ) : (
                !reviewLoading && (
                  <div className="text-sm text-slate-400">
                    Review will appear here after submission.
                  </div>
                )
              )}
            </div>
          )}

          {/* Session Overview */}
          {showResult && currentIndex === questions.length - 1 && (
            <div className="mb-6 p-5 bg-slate-800/60 border border-slate-700 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Practice Session Overview</h4>
                <span className="text-xs text-slate-400">
                  {monitorStats.attempted} / {questions.length} attempted
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-700">
                  <p className="text-xs text-slate-400">Correct</p>
                  <p className="text-xl font-semibold text-green-400">{monitorStats.correct}</p>
                </div>
                <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-700">
                  <p className="text-xs text-slate-400">Incorrect</p>
                  <p className="text-xl font-semibold text-red-400">
                    {Math.max(monitorStats.attempted - monitorStats.correct, 0)}
                  </p>
                </div>
                <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-700">
                  <p className="text-xs text-slate-400">Accuracy</p>
                  <p className="text-xl font-semibold text-blue-300">{monitorStats.accuracy}%</p>
                </div>
                <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-700">
                  <p className="text-xs text-slate-400">Avg Time</p>
                  <p className="text-xl font-semibold text-slate-200">{monitorStats.avgTime}s</p>
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-400">
                Total Time:{' '}
                {monitorHistory.reduce((sum, entry) => sum + entry.timeTaken, 0)}s
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {!showResult ? (
              <>
                <button
                  onClick={getHint}
                  disabled={showHint}
                  className="px-6 py-3 bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-50 text-yellow-400 rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  <Lightbulb className="w-4 h-4" />
                  Hint
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={selectedAnswer === null}
                  className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors"
                >
                  Submit Answer
                </button>
              </>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentIndex >= questions.length - 1}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                Next Question
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {questions.length === 0 && !loading && (
        <div className="bg-slate-800/50 rounded-2xl p-12 border border-slate-700 text-center">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400">Select filters and load questions to start practicing.</p>
        </div>
      )}
    </motion.div>
  )
}

// Mock Tests Component
function MockTests({ setView, user }: { setView: (view: View) => void; user: User | null }) {
  const [tests, setTests] = useState<MockTest[]>([])
  const [loading, setLoading] = useState(true)
  const [testTypeFilter, setTestTypeFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [chapterFilter, setChapterFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const isStaff = user?.role === 'teacher' || user?.role === 'admin'
  const [bulkJson, setBulkJson] = useState('')
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [bulkTemplateStatus, setBulkTemplateStatus] = useState<string | null>(null)
  const currentTestStorageKey = useMemo(
    () => `jee_study_buddy_current_test_id_v1_${user?.id || 'anon'}`,
    [user?.id]
  )
  const MOCK_BULK_TEMPLATE = JSON.stringify([
    {
      title: 'JEE Main Full Test - 2',
      description: 'Mixed full-length test',
      testType: 'full',
      subject: 'Physics',
      chapter: 'Electrostatics',
      difficulty: 'Medium',
      duration: 180,
      totalMarks: 300,
      negativeMarking: 1,
      questionIds: ['q_id_1', 'q_id_2'],
      instructions: '4 marks for correct, -1 for wrong'
    }
  ], null, 2)

  useEffect(() => {
    api.mock.tests()
      .then(data => setTests(data.tests || []))
      .finally(() => setLoading(false))
  }, [])

  const filteredTests = tests.filter(t => {
    if (testTypeFilter && t.testType !== testTypeFilter) return false
    if (subjectFilter && t.subject !== subjectFilter) return false
    if (chapterFilter && t.chapter !== chapterFilter) return false
    if (difficultyFilter && t.difficulty !== difficultyFilter) return false
    return true
  })

  const handleBulkUpload = async () => {
    setBulkStatus(null)
    let parsed: any
    try {
      parsed = JSON.parse(bulkJson)
    } catch {
      setBulkStatus('Invalid JSON format.')
      return
    }
    if (!Array.isArray(parsed)) {
      setBulkStatus('JSON must be an array of test objects.')
      return
    }
    try {
      const data = await api.mock.create({ tests: parsed })
      setBulkStatus(`Uploaded ${data.created || 0} tests.`)
      setBulkJson('')
      const refreshed = await api.mock.tests()
      setTests(refreshed.tests || [])
    } catch (error: any) {
      setBulkStatus('Failed to upload tests.')
    }
  }

  const handleCopyMockTemplate = async () => {
    if (!navigator?.clipboard) {
      setBulkTemplateStatus('Clipboard not available.')
      return
    }
    try {
      await navigator.clipboard.writeText(MOCK_BULK_TEMPLATE)
      setBulkTemplateStatus('Format copied to clipboard.')
      setTimeout(() => setBulkTemplateStatus(null), 2000)
    } catch {
      setBulkTemplateStatus('Copy failed.')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Filters */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {['', 'full', 'subject', 'chapter'].map(f => (
            <button
              key={f}
              onClick={() => setTestTypeFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${
                testTypeFilter === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
              }`}
            >
              {f === '' ? 'All Tests' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={subjectFilter}
            onChange={e => {
              const nextSubject = e.target.value
              setSubjectFilter(nextSubject)
              if (!nextSubject) {
                setChapterFilter('')
              }
            }}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">All Subjects</option>
            {Object.keys(SUBJECTS).map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
          <select
            value={chapterFilter}
            onChange={e => setChapterFilter(e.target.value)}
            disabled={!subjectFilter}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">All Chapters</option>
            {subjectFilter && (SUBJECTS[subjectFilter as keyof typeof SUBJECTS] || []).map(ch => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
          <select
            value={difficultyFilter}
            onChange={e => setDifficultyFilter(e.target.value)}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">All Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Tests Grid */}
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTests.map(test => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{test.title}</h3>
                  <p className="text-sm text-slate-400">
                    {[test.subject || 'All Subjects', test.chapter, test.difficulty].filter(Boolean).join(' • ')}
                  </p>
                </div>
                {test.attempted && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                    Attempted
                  </span>
                )}
              </div>

              <p className="text-slate-400 text-sm mb-4">{test.description}</p>

              <div className="flex items-center gap-4 text-sm text-slate-400 mb-4">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {test.duration} min
                </span>
                <span className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  {test.totalMarks} marks
                </span>
              </div>

              {test.bestScore > 0 && (
                <p className="text-sm text-slate-400 mb-4">
                  Best Score: <span className="text-blue-400">{test.bestScore}</span>
                </p>
              )}

              <button
                onClick={() => {
                  localStorage.setItem(currentTestStorageKey, test.id)
                  setView('mock-test')
                }}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {test.attempted ? 'Retake Test' : 'Start Test'}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {isStaff && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-lg font-semibold">Bulk Upload Mock Tests (JSON)</h3>
            <button
              onClick={handleCopyMockTemplate}
              className="px-3 py-1 text-xs bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-600/50 transition-colors"
            >
              Copy JSON Format
            </button>
          </div>
          <div className="text-xs text-slate-400 mb-3 space-y-1">
            <p>title: test name — required</p>
            <p>description: short summary — optional</p>
            <p>testType: full/subject/chapter — required</p>
            <p>subject: Physics/Chemistry/Mathematics — optional</p>
            <p>chapter: exact chapter name — optional</p>
            <p>difficulty: Easy/Medium/Hard — optional</p>
            <p>duration: minutes (e.g. 180) — required</p>
            <p>totalMarks: number — required</p>
            <p>negativeMarking: number — required</p>
            <p>questionIds: array of question IDs — required</p>
            <p>instructions: text — optional</p>
          </div>
          {bulkTemplateStatus && (
            <p className="text-xs text-slate-400 mb-2">{bulkTemplateStatus}</p>
          )}
          <pre className="w-full px-4 py-3 bg-slate-900/40 border border-slate-700 rounded-xl text-xs text-slate-300 overflow-x-auto mb-3">
            {MOCK_BULK_TEMPLATE}
          </pre>
          <textarea
            value={bulkJson}
            onChange={e => setBulkJson(e.target.value)}
            placeholder={`[\n  {\n    \"title\": \"JEE Main Full Test - 2\",\n    \"description\": \"Mixed full-length test\",\n    \"testType\": \"full\",\n    \"subject\": \"Physics\",\n    \"chapter\": \"Electrostatics\",\n    \"difficulty\": \"Medium\",\n    \"duration\": 180,\n    \"totalMarks\": 300,\n    \"negativeMarking\": 1,\n    \"questionIds\": [\"q_id_1\", \"q_id_2\"],\n    \"instructions\": \"4 marks for correct, -1 for wrong\"\n  }\n]`}
            rows={8}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 mb-3"
          />
          {bulkStatus && (
            <p className="text-sm text-slate-300 mb-3">{bulkStatus}</p>
          )}
          <button
            onClick={handleBulkUpload}
            disabled={!bulkJson.trim()}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
          >
            Upload Mock Tests
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredTests.length === 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-12 border border-slate-700 text-center">
          <ClipboardList className="w-12 h-12 mx-auto mb-4 text-slate-500" />
          <p className="text-slate-400">No mock tests available at the moment.</p>
        </div>
      )}
    </motion.div>
  )
}

// Mock Test View Component
function MockTestView({ setView, user }: { setView: (view: View) => void; user: User | null }) {
  const [test, setTest] = useState<any>(null)
  const [attempt, setAttempt] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [mockSelectMode, setMockSelectMode] = useState(false)
  const [mockSelectedIds, setMockSelectedIds] = useState<string[]>([])
  const [mockSolveMode, setMockSolveMode] = useState(false)
  const [mockSolveIndex, setMockSolveIndex] = useState(0)
  const submitRef = useRef<{
    attempt: any
    test: any
    timeLeft: number
    answers: Record<string, string | number>
    submitted: boolean
  }>({ attempt: null, test: null, timeLeft: 0, answers: {}, submitted: false })
  const currentTestStorageKey = useMemo(
    () => `jee_study_buddy_current_test_id_v1_${user?.id || 'anon'}`,
    [user?.id]
  )

  // Keep ref updated
  useEffect(() => {
    submitRef.current = { attempt, test, timeLeft, answers, submitted }
  }, [attempt, test, timeLeft, answers, submitted])

  const handleSubmit = async () => {
    const current = submitRef.current
    if (!current.attempt || current.submitted) return

    setSubmitted(true)
    const timeTaken = current.test?.duration ? current.test.duration * 60 - current.timeLeft : 0

    try {
      const data = await api.mock.submit(current.attempt.id, current.answers, timeTaken)
      setResult(data.result)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    const testId = localStorage.getItem(currentTestStorageKey)
    if (testId) {
      api.mock.start(testId)
        .then(data => {
          setTest(data.test)
          setAttempt(data.attempt)
          setTimeLeft(data.test.duration * 60)
          if (data.resumed && data.attempt.answers) {
            setAnswers(JSON.parse(data.attempt.answers))
          }
          setMockSelectMode(false)
          setMockSelectedIds([])
          setMockSolveMode(false)
          setMockSolveIndex(0)
        })
        .catch(() => setView('mock'))
        .finally(() => setLoading(false))
    } else {
      setView('mock')
    }
  }, [currentTestStorageKey, setView])

  // Timer
  useEffect(() => {
    if (timeLeft > 0 && !submitted) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer)
            handleSubmit()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeLeft, submitted])

  // Auto-save
  useEffect(() => {
    if (attempt && !submitted) {
      const saveTimer = setInterval(() => {
        api.mock.save(attempt.id, answers, currentQuestion).catch(() => {})
      }, 30000)
      return () => clearInterval(saveTimer)
    }
  }, [attempt, answers, currentQuestion, submitted])

  const questions = test?.questions || []
  const selectedQuestionIndices = useMemo(() => {
    if (mockSelectedIds.length === 0) return []
    const selectedSet = new Set(mockSelectedIds)
    return questions
      .map((item: any, index: number) => ({ id: item?.id, index }))
      .filter(item => item.id && selectedSet.has(item.id))
  }, [questions, mockSelectedIds])
  const activeQuestionIndex = mockSolveMode
    ? (selectedQuestionIndices[mockSolveIndex]?.index ?? 0)
    : currentQuestion
  const question = questions[activeQuestionIndex]

  const toggleMockSelected = (id: string) => {
    setMockSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const clearMockSelected = () => {
    setMockSelectedIds([])
  }

  const selectAllMock = () => {
    if (questions.length === 0) return
    setMockSelectedIds(questions.map(item => item.id).filter(Boolean))
  }

  const startMockSolve = () => {
    if (selectedQuestionIndices.length === 0) return
    setMockSolveMode(true)
    setMockSelectMode(false)
    setMockSolveIndex(0)
    setCurrentQuestion(selectedQuestionIndices[0].index)
  }

  const exitMockSolve = () => {
    setMockSolveMode(false)
  }

  if (loading) return <LoadingSpinner />

  // Result View
  if (submitted && result) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 text-center">
          <Award className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
          <h2 className="text-2xl font-bold mb-2">Test Completed!</h2>
          <p className="text-slate-400 mb-6">{test.title}</p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-500/10 rounded-xl">
              <p className="text-3xl font-bold text-green-400">{result.correct}</p>
              <p className="text-sm text-slate-400">Correct</p>
            </div>
            <div className="p-4 bg-red-500/10 rounded-xl">
              <p className="text-3xl font-bold text-red-400">{result.incorrect}</p>
              <p className="text-sm text-slate-400">Incorrect</p>
            </div>
            <div className="p-4 bg-slate-700/50 rounded-xl">
              <p className="text-3xl font-bold text-slate-300">{result.unattempted}</p>
              <p className="text-sm text-slate-400">Skipped</p>
            </div>
          </div>

          <div className="text-4xl font-bold mb-2">
            <span className="text-blue-400">{result.score}</span>
            <span className="text-slate-400">/{test.totalMarks}</span>
          </div>
          <p className="text-slate-400 mb-6">{result.percentage}% Score</p>

          <button
            onClick={() => setView('mock')}
            className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium transition-colors"
          >
            Back to Tests
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 flex items-center justify-between sticky top-0 z-10">
        <h3 className="font-semibold">{test.title}</h3>
        <div className="flex items-center gap-4">
          <span className={`text-lg font-mono ${timeLeft < 300 ? 'text-red-400' : 'text-slate-300'}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
          {mockSolveMode && (
            <button
              onClick={exitMockSolve}
              className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg font-medium transition-colors"
            >
              Exit Solve
            </button>
          )}
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-colors"
          >
            Submit Test
          </button>
        </div>
      </div>

      {/* Question Palette */}
      {!mockSolveMode && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMockSelectMode(prev => !prev)}
                className={`px-3 py-1 rounded-full border text-xs transition-colors ${
                  mockSelectMode
                    ? 'bg-blue-500/20 border-blue-400/50 text-blue-100'
                    : 'bg-slate-800/60 border-slate-600 text-slate-200 hover:border-slate-500'
                }`}
              >
                {mockSelectMode ? 'Selecting' : 'Select Questions'}
              </button>
              {mockSelectMode && (
                <span className="text-xs text-slate-400">{mockSelectedIds.length} selected</span>
              )}
            </div>
            {mockSelectMode && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllMock}
                  className="px-3 py-1 rounded-full border border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-500 text-xs"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearMockSelected}
                  disabled={mockSelectedIds.length === 0}
                  className="px-3 py-1 rounded-full border border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-500 text-xs disabled:opacity-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={startMockSolve}
                  disabled={mockSelectedIds.length === 0}
                  className="px-3 py-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 text-xs disabled:opacity-50"
                >
                  Solve Selected
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {questions.map((item: any, i: number) => {
              const isSelected = mockSelectedIds.includes(item.id)
              const isActive = currentQuestion === i
              const answered = answers[item?.id]
              return (
                <button
                  key={item.id || i}
                  onClick={() => {
                    if (mockSelectMode) {
                      if (item.id) {
                        toggleMockSelected(item.id)
                      }
                    } else {
                      setCurrentQuestion(i)
                    }
                  }}
                  className={`w-10 h-10 rounded-lg font-medium transition-all ${
                    mockSelectMode && isSelected
                      ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/50'
                      : isActive
                        ? 'bg-blue-500 text-white'
                        : answered
                          ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Question */}
      {question && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-sm ${
              question.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400' :
              question.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {question.difficulty}
            </span>
            <span className="text-slate-400 text-sm">{question.subject}</span>
          </div>

          <div className="text-lg mb-6 p-4 bg-slate-700/30 rounded-xl">
            <MathText text={question.question} />
          </div>

          {question.options && (
            <div className="space-y-3">
              {parseQuestionOptions(question.options).map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setAnswers(prev => ({ ...prev, [question.id]: i.toString() }))}
                  className={`w-full p-4 rounded-xl text-left transition-all flex items-center gap-3 ${
                    answers[question.id] === i.toString()
                      ? 'bg-blue-500/20 border border-blue-500'
                      : 'bg-slate-700/30 border border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
                    answers[question.id] === i.toString()
                      ? 'bg-blue-500 text-white'
                      : 'bg-slate-600'
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <MathText text={option} as="span" />
                </button>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => {
                if (mockSolveMode) {
                  const nextIndex = Math.max(0, mockSolveIndex - 1)
                  setMockSolveIndex(nextIndex)
                  if (selectedQuestionIndices[nextIndex]) {
                    setCurrentQuestion(selectedQuestionIndices[nextIndex].index)
                  }
                } else {
                  setCurrentQuestion(prev => Math.max(0, prev - 1))
                }
              }}
              disabled={mockSolveMode ? mockSolveIndex === 0 : currentQuestion === 0}
              className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 rounded-xl font-medium transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setAnswers(prev => ({ ...prev, [question.id]: '' }))}
              className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl font-medium transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (mockSolveMode) {
                  const nextIndex = Math.min(selectedQuestionIndices.length - 1, mockSolveIndex + 1)
                  setMockSolveIndex(nextIndex)
                  if (selectedQuestionIndices[nextIndex]) {
                    setCurrentQuestion(selectedQuestionIndices[nextIndex].index)
                  }
                } else {
                  setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))
                }
              }}
              disabled={
                mockSolveMode
                  ? mockSolveIndex >= selectedQuestionIndices.length - 1
                  : currentQuestion === questions.length - 1
              }
              className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
            >
              Save & Next
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// PYQs Component
function PYQs({ user }: { user: User | null }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'teacher'
  const [selectedExam, setSelectedExam] = useState('')
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [year, setYear] = useState('')
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [logoStatus, setLogoStatus] = useState<Record<string, 'loaded' | 'error'>>({})
  const [pyqSelections, setPyqSelections] = useState<Record<string, string | number | null>>({})
  const [pyqChecked, setPyqChecked] = useState<Record<string, boolean>>({})
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<'subject' | 'chapter' | 'year'>('subject')
  const [bulkJson, setBulkJson] = useState('')
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [bulkTemplateStatus, setBulkTemplateStatus] = useState<string | null>(null)
  const [pyqError, setPyqError] = useState<string | null>(null)
  const [pyqSolveMode, setPyqSolveMode] = useState(false)
  const [pyqSolveIndex, setPyqSolveIndex] = useState(0)
  const [pyqSolveQuestions, setPyqSolveQuestions] = useState<any[]>([])
  const [pyqAutoStartPending, setPyqAutoStartPending] = useState(false)
  const pyqAutoStartTimer = useRef<number | null>(null)
  const PYQ_BULK_TEMPLATE = JSON.stringify([
    {
      exam: 'JEE Main',
      year: 2023,
      subject: 'Physics',
      chapter: 'Electrostatics',
      difficulty: 'Medium',
      question: 'Two point charges ...',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 1,
      solution: '...',
      explanation: '...',
      alternateApproach: '...'
    }
  ], null, 2)
  const [pyqForm, setPyqForm] = useState({
    exam: '',
    year: '',
    subject: '',
    chapter: '',
    difficulty: 'Medium',
    question: '',
    options: ['', '', '', ''],
    correctAnswer: '0',
    solution: '',
    explanation: '',
    alternateApproach: ''
  })

  const loadQuestions = async () => {
    if (!selectedExam) return
    setLoading(true)
    setPyqError(null)
    try {
      const data = await api.pyq.list(selectedExam, subject, chapter, difficulty, year)
      setQuestions(data.questions || [])
      setPyqSelections({})
      setPyqChecked({})
    } catch (error) {
      console.error(error)
      setQuestions([])
      setPyqSelections({})
      setPyqChecked({})
      setPyqError('Unable to load PYQs right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const clearAutoStartTimer = () => {
    if (pyqAutoStartTimer.current) {
      window.clearTimeout(pyqAutoStartTimer.current)
      pyqAutoStartTimer.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearAutoStartTimer()
    }
  }, [])

  useEffect(() => {
    if (selectedExam) {
      loadQuestions()
    }
  }, [selectedExam])

  const handleCreatePyq = async () => {
    if (!pyqForm.exam || !pyqForm.subject || !pyqForm.chapter || !pyqForm.question) return
    try {
      await api.pyq.create({
        exam: pyqForm.exam,
        year: pyqForm.year ? parseInt(pyqForm.year, 10) : undefined,
        subject: pyqForm.subject,
        chapter: pyqForm.chapter,
        difficulty: pyqForm.difficulty,
        question: pyqForm.question,
        options: pyqForm.options,
        correctAnswer: pyqForm.correctAnswer,
        solution: pyqForm.solution,
        explanation: pyqForm.explanation,
        alternateApproach: pyqForm.alternateApproach
      })
      setPyqForm({
        exam: '',
        year: '',
        subject: '',
        chapter: '',
        difficulty: 'Medium',
        question: '',
        options: ['', '', '', ''],
        correctAnswer: '0',
        solution: '',
        explanation: '',
        alternateApproach: ''
      })
      if (selectedExam) {
        loadQuestions()
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleBulkUpload = async () => {
    setBulkStatus(null)
    let parsed: any
    try {
      parsed = JSON.parse(bulkJson)
    } catch {
      setBulkStatus('Invalid JSON format.')
      return
    }
    if (!Array.isArray(parsed)) {
      setBulkStatus('JSON must be an array of PYQ objects.')
      return
    }
    try {
      const data = await api.pyq.create({ questions: parsed })
      setBulkStatus(`Uploaded ${data.created || 0} PYQs.`)
      setBulkJson('')
      if (selectedExam) {
        loadQuestions()
      }
    } catch {
      setBulkStatus('Failed to upload PYQs.')
    }
  }

  const handleCopyPyqTemplate = async () => {
    if (!navigator?.clipboard) {
      setBulkTemplateStatus('Clipboard not available.')
      return
    }
    try {
      await navigator.clipboard.writeText(PYQ_BULK_TEMPLATE)
      setBulkTemplateStatus('Format copied to clipboard.')
      setTimeout(() => setBulkTemplateStatus(null), 2000)
    } catch {
      setBulkTemplateStatus('Copy failed.')
    }
  }

  const examBadge = (exam: string) =>
    exam.split(/\s+/).map(word => word[0]).join('').toUpperCase()

  const openWizard = (exam: string) => {
    clearAutoStartTimer()
    setSelectedExam(exam)
    setSubject('')
    setChapter('')
    setYear('')
    setQuestions([])
    setPyqSelections({})
    setPyqChecked({})
    setPyqAutoStartPending(false)
    setPyqSolveMode(false)
    setPyqSolveIndex(0)
    setPyqSolveQuestions([])
    setPyqError(null)
    setWizardStep('subject')
    setWizardOpen(true)
  }

  const handleSubjectPick = (value: string) => {
    setSubject(value)
    setChapter('')
    setYear('')
    setWizardStep('chapter')
  }

  const handleAllSubjectsPick = () => {
    setSubject('')
    setChapter('')
    setYear('')
    setWizardStep('chapter')
    setWizardOpen(true)
  }

  const closeWizard = () => {
    clearAutoStartTimer()
    setPyqError(null)
    setWizardOpen(false)
    setPyqAutoStartPending(true)
  }

  const handleChapterPick = (value: string) => {
    setChapter(value)
    setYear('')
    setWizardStep('year')
  }

  const handleYearPick = (value: string) => {
    setYear(value)
    closeWizard()
  }

  const handleCheckAnswer = (q: any) => {
    const selected = pyqSelections[q.id]
    if (selected === null || selected === undefined || selected === '') return
    setPyqChecked(prev => ({ ...prev, [q.id]: true }))
  }

  const handleResetAnswer = (qId: string) => {
    setPyqSelections(prev => ({ ...prev, [qId]: null }))
    setPyqChecked(prev => ({ ...prev, [qId]: false }))
  }

  const exitPyqSolve = () => {
    clearAutoStartTimer()
    setPyqSolveMode(false)
    setPyqSolveQuestions([])
    setPyqAutoStartPending(false)
  }

  const getSubjectsForExam = (exam: string) =>
    PYQ_EXAM_SUBJECTS[exam] || ['Physics', 'Chemistry', 'Mathematics']

  const getChaptersForSubject = (value: string) => {
    if (value && SUBJECTS[value as keyof typeof SUBJECTS]) {
      return SUBJECTS[value as keyof typeof SUBJECTS]
    }
    const all = new Set<string>()
    Object.values(SUBJECTS).forEach(list => {
      list.forEach(ch => all.add(ch))
    })
    return Array.from(all).sort((a, b) => a.localeCompare(b))
  }

  const baseQuestions = useMemo(() => {
    if (!selectedExam) return []
    return questions.filter(q => q.pyqType === selectedExam)
  }, [questions, selectedExam])

  const wizardAvailableSubjects = useMemo(() => {
    if (!selectedExam) return []
    const subjectSet = new Set<string>()
    for (const q of baseQuestions) {
      if (typeof q?.subject === 'string' && q.subject.trim()) {
        subjectSet.add(q.subject.trim())
      }
    }
    return Array.from(subjectSet).sort((a, b) => a.localeCompare(b))
  }, [baseQuestions, selectedExam])

  const wizardSubjectChapterCount = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const q of baseQuestions) {
      const subj = typeof q?.subject === 'string' ? q.subject.trim() : ''
      const chap = typeof q?.chapter === 'string' ? q.chapter.trim() : ''
      if (!subj || !chap) continue
      if (!map.has(subj)) map.set(subj, new Set())
      map.get(subj)?.add(chap)
    }
    const counts = new Map<string, number>()
    map.forEach((set, key) => counts.set(key, set.size))
    return counts
  }, [baseQuestions])

  const wizardAvailableChapters = useMemo(() => {
    const chapterSet = new Set<string>()
    for (const q of baseQuestions) {
      if (subject && q.subject !== subject) continue
      if (typeof q?.chapter === 'string' && q.chapter.trim()) {
        chapterSet.add(q.chapter.trim())
      }
    }
    return Array.from(chapterSet).sort((a, b) => a.localeCompare(b))
  }, [baseQuestions, subject])

  const wizardAvailableYears = useMemo(() => {
    const yearSet = new Set<number>()
    for (const q of baseQuestions) {
      if (subject && q.subject !== subject) continue
      if (chapter && q.chapter !== chapter) continue
      const rawYear = typeof q?.pyqYear === 'number' ? q.pyqYear : null
      if (Number.isFinite(rawYear) && rawYear) {
        yearSet.add(rawYear)
      }
    }
    return Array.from(yearSet).sort((a, b) => b - a)
  }, [baseQuestions, subject, chapter])

  const subjectLabel = subject || (selectedExam ? 'All Subjects' : 'Subject')
  const chapterLabel = chapter || (selectedExam ? 'All Chapters' : 'Chapter')
  const yearLabel = year || (selectedExam ? 'All Years' : 'Year')
  const wizardYearLabel = chapter || 'All Chapters'

  useEffect(() => {
    if (!wizardOpen && selectedExam) {
      loadQuestions()
    }
  }, [wizardOpen, selectedExam, subject, chapter, year, difficulty])

  useEffect(() => {
    if (!pyqAutoStartPending) return
    if (loading || wizardOpen || pyqSolveMode) return
    if (!selectedExam) {
      setPyqAutoStartPending(false)
      return
    }
    const pool = baseQuestions
    if (pool.length === 0) {
      if (!pyqError) {
        setPyqError('Is selection me question nahi hai.')
      }
      setPyqAutoStartPending(false)
      return
    }
    setPyqSelections({})
    setPyqChecked({})
    setPyqSolveQuestions(pool)
    setPyqSolveIndex(0)
    setPyqSolveMode(true)
    setPyqAutoStartPending(false)
  }, [
    pyqAutoStartPending,
    loading,
    wizardOpen,
    pyqSolveMode,
    selectedExam,
    baseQuestions,
    pyqError
  ])

  if (pyqSolveMode) {
    const solveQuestions = pyqSolveQuestions
    const solveQuestion = solveQuestions[pyqSolveIndex]
    const options = solveQuestion ? parseQuestionOptions(solveQuestion.options) : []
    const correctIndex = solveQuestion
      ? Number.parseInt(String(solveQuestion.correctAnswer ?? ''), 10)
      : Number.NaN
    const correctOption = Number.isFinite(correctIndex) ? options[correctIndex] : undefined
    const selected = solveQuestion ? pyqSelections[solveQuestion.id] : null
    const checked = solveQuestion ? !!pyqChecked[solveQuestion.id] : false
    const isCorrect = solveQuestion
      ? checked && String(selected) === String(solveQuestion.correctAnswer ?? '')
      : false

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">PYQs</p>
              <h3 className="text-lg font-semibold">{selectedExam || 'PYQs'}</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-300">
                {solveQuestions.length > 0 ? `${pyqSolveIndex + 1} / ${solveQuestions.length}` : '0 / 0'}
              </span>
              <button
                onClick={exitPyqSolve}
                className="px-3 py-2 rounded-lg border border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/60"
              >
                Back to List
              </button>
            </div>
          </div>
        </div>

        {solveQuestion ? (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full">{solveQuestion.pyqType}</span>
                {solveQuestion.pyqYear && (
                  <span className="px-3 py-1 bg-slate-700/50 rounded-full">{solveQuestion.pyqYear}</span>
                )}
                <span>{solveQuestion.subject} • {solveQuestion.chapter}</span>
                <span>{solveQuestion.difficulty}</span>
                {checked && (
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCheckAnswer(solveQuestion)}
                  disabled={selected === null || selected === undefined || selected === ''}
                  className="px-3 py-2 bg-blue-500/20 text-blue-200 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                >
                  Check Answer
                </button>
                {checked && (
                  <button
                    onClick={() => handleResetAnswer(solveQuestion.id)}
                    className="px-3 py-2 bg-slate-700/50 rounded-lg text-sm hover:bg-slate-600/50 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="text-lg mb-4">
              <MathText text={solveQuestion.question} />
            </div>

            {options.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {options.map((opt: string, i: number) => {
                  const isSelected = String(selected) === String(i)
                  return (
                    <button
                      key={i}
                      onClick={() => setPyqSelections(prev => ({ ...prev, [solveQuestion.id]: i }))}
                      className={`p-3 rounded-xl border flex items-start gap-3 text-left transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-slate-700'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <MathText text={opt} />
                    </button>
                  )
                })}
              </div>
            )}

            {checked && (
              <div className={`mt-4 p-4 rounded-xl border ${
                isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="text-sm mb-2 text-slate-200">
                  Correct Answer:{' '}
                  {Number.isFinite(correctIndex) ? String.fromCharCode(65 + correctIndex) : ''}
                  {correctOption ? `: ` : ''}
                  {correctOption && <MathText as="span" text={correctOption} />}
                </div>

                {!isCorrect && (
                  <>
                    {solveQuestion.solution ? (
                      <div className="mt-3 text-slate-300">
                        <p className="text-sm font-medium mb-1">Uploaded Solution:</p>
                        <MathText text={solveQuestion.solution} />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No solution uploaded for this question.</p>
                    )}
                    {solveQuestion.explanation && (
                      <div className="mt-3 text-slate-300">
                        <p className="text-sm font-medium mb-1">Explanation:</p>
                        <MathText text={solveQuestion.explanation} />
                      </div>
                    )}
                  </>
                )}

                {isCorrect && (
                  <div className="mt-3 text-slate-300">
                    <p className="text-sm font-medium mb-1">Alternate Approach (AI):</p>
                    {solveQuestion.alternateApproach ? (
                      <MathText text={solveQuestion.alternateApproach} />
                    ) : (
                      <div className="text-sm text-slate-400">No alternate approach uploaded for this question.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPyqSolveIndex(prev => Math.max(0, prev - 1))}
                disabled={pyqSolveIndex === 0}
                className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPyqSolveIndex(prev => Math.min(solveQuestions.length - 1, prev + 1))}
                disabled={pyqSolveIndex >= solveQuestions.length - 1}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Next Question
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/50 rounded-2xl p-12 border border-slate-700 text-center">
            <FileQuestion className="w-12 h-12 mx-auto mb-4 text-slate-500" />
            <p className="text-slate-400">No questions available. Go back and adjust filters.</p>
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold mb-4">Top Engineering Exams PYQs</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {PYQ_EXAMS.map(exam => (
            <button
              key={exam}
              onClick={() => openWizard(exam)}
              className={`p-4 rounded-xl border transition-all text-left flex items-center gap-3 ${
                selectedExam === exam
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold overflow-hidden relative">
                {PYQ_LOGOS[exam] && logoStatus[exam] !== 'error' && (
                  <img
                    src={PYQ_LOGOS[exam]}
                    alt={`${exam} logo`}
                    className={`absolute inset-0 w-full h-full object-contain bg-white transition-opacity ${
                      logoStatus[exam] === 'loaded' ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setLogoStatus(prev => ({ ...prev, [exam]: 'loaded' }))}
                    onError={() => setLogoStatus(prev => ({ ...prev, [exam]: 'error' }))}
                  />
                )}
                <span className="sr-only">{exam}</span>
              </div>
              <span className="font-medium">{exam}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span className="px-3 py-1 bg-slate-700/50 rounded-full">{selectedExam || 'Select Exam'}</span>
          <span className="px-3 py-1 bg-slate-700/50 rounded-full">{subjectLabel}</span>
          <span className="px-3 py-1 bg-slate-700/50 rounded-full">{chapterLabel}</span>
          <span className="px-3 py-1 bg-slate-700/50 rounded-full">{yearLabel}</span>
          <button
            onClick={() => selectedExam && setWizardOpen(true)}
            disabled={!selectedExam}
            className="px-3 py-1 bg-slate-700/50 rounded-full text-slate-200 hover:bg-slate-600/50 transition-colors"
          >
            Change Selection
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={difficulty}
            onChange={e => {
              clearAutoStartTimer()
              setPyqError(null)
              setPyqAutoStartPending(true)
              setDifficulty(e.target.value)
            }}
            className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <div className="md:col-span-2 text-xs text-slate-400 flex items-center">
            Questions open automatically after you finish the selection or change difficulty.
          </div>
        </div>

        {baseQuestions.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>
              Showing {baseQuestions.length} PYQs for the current selection.
            </span>
          </div>
        )}

      </div>

      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <p className="text-xs text-slate-400">PYQ Selection</p>
                <h3 className="text-lg font-semibold">{selectedExam}</h3>
              </div>
              <button
                onClick={closeWizard}
                className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4">
              {wizardStep === 'subject' && (
                <>
                  <p className="text-sm text-slate-400 mb-4">Select Subject</p>
                  <button
                    onClick={handleAllSubjectsPick}
                    disabled={!loading && wizardAvailableSubjects.length === 0}
                    className="w-full text-left px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors mb-3"
                  >
                    All Subjects
                  </button>
                  {loading ? (
                    <p className="text-xs text-slate-400">Loading subjects...</p>
                  ) : wizardAvailableSubjects.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No subjects available for this exam. Upload PYQs to unlock filters.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {wizardAvailableSubjects.map(s => (
                        <button
                          key={s}
                          onClick={() => handleSubjectPick(s)}
                          className="p-3 rounded-xl border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors text-left"
                        >
                          <p className="font-medium">{s}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {wizardSubjectChapterCount.get(s) || 0} chapters
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {wizardStep === 'chapter' && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setWizardStep('subject')}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Back
                    </button>
                    <span className="text-xs text-slate-500">/</span>
                    <span className="text-sm text-slate-300">{subject || 'All Subjects'}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">Select Chapter</p>
                  <button
                    onClick={() => handleChapterPick('')}
                    disabled={wizardAvailableChapters.length === 0}
                    className="w-full text-left px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors mb-3"
                  >
                    All Chapters
                  </button>
                  {loading ? (
                    <p className="text-xs text-slate-400">Loading chapters...</p>
                  ) : wizardAvailableChapters.length === 0 ? (
                    <p className="text-xs text-slate-400">No chapters available for this selection.</p>
                  ) : (
                    <div className="max-h-72 overflow-auto pr-1 space-y-2">
                      {wizardAvailableChapters.map(ch => (
                        <button
                          key={ch}
                          onClick={() => handleChapterPick(ch)}
                          className="w-full text-left px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors"
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {wizardStep === 'year' && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setWizardStep('chapter')}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Back
                    </button>
                    <span className="text-xs text-slate-500">/</span>
                    <span className="text-sm text-slate-300">{wizardYearLabel}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">Select Year</p>
                  <button
                    onClick={() => handleYearPick('')}
                    className="w-full text-left px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors mb-3"
                  >
                    All Years
                  </button>
                  {loading ? (
                    <p className="text-xs text-slate-400">Loading years...</p>
                  ) : wizardAvailableYears.length === 0 ? (
                    <p className="text-xs text-slate-400">No years available for this selection.</p>
                  ) : (
                    <div className="max-h-72 overflow-auto pr-1 space-y-2">
                      {wizardAvailableYears.map(y => (
                        <button
                          key={y}
                          onClick={() => handleYearPick(String(y))}
                          className="w-full text-left px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-blue-500 transition-colors"
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {pyqError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm px-4 py-3 rounded-xl">
          {pyqError}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Add PYQ Question</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <select
              value={pyqForm.exam}
              onChange={e => setPyqForm(prev => ({ ...prev, exam: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Exam</option>
              {PYQ_EXAMS.map(exam => (
                <option key={exam} value={exam}>{exam}</option>
              ))}
            </select>

            <input
              type="number"
              value={pyqForm.year}
              onChange={e => setPyqForm(prev => ({ ...prev, year: e.target.value }))}
              placeholder="Year (optional)"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            />

            <select
              value={pyqForm.difficulty}
              onChange={e => setPyqForm(prev => ({ ...prev, difficulty: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <select
              value={pyqForm.subject}
              onChange={e => setPyqForm(prev => ({ ...prev, subject: e.target.value, chapter: '' }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Subject</option>
              {(pyqForm.exam ? getSubjectsForExam(pyqForm.exam) : Object.keys(SUBJECTS)).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={pyqForm.chapter}
              onChange={e => setPyqForm(prev => ({ ...prev, chapter: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
              disabled={!pyqForm.subject}
            >
              <option value="">Select Chapter</option>
              {pyqForm.subject && SUBJECTS[pyqForm.subject as keyof typeof SUBJECTS].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <textarea
            value={pyqForm.question}
            onChange={e => setPyqForm(prev => ({ ...prev, question: e.target.value }))}
            placeholder="Enter PYQ (LaTeX supported)"
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 mb-4"
            rows={4}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {pyqForm.options.map((opt, i) => (
              <input
                key={i}
                value={opt}
                onChange={e => {
                  const next = [...pyqForm.options]
                  next[i] = e.target.value
                  setPyqForm(prev => ({ ...prev, options: next }))
                }}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
              />
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <select
              value={pyqForm.correctAnswer}
              onChange={e => setPyqForm(prev => ({ ...prev, correctAnswer: e.target.value }))}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            >
              {pyqForm.options.map((_, i) => (
                <option key={i} value={i.toString()}>
                  Correct Option {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
            <input
              value={pyqForm.solution}
              onChange={e => setPyqForm(prev => ({ ...prev, solution: e.target.value }))}
              placeholder="Solution (optional)"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            />
            <input
              value={pyqForm.explanation}
              onChange={e => setPyqForm(prev => ({ ...prev, explanation: e.target.value }))}
              placeholder="Explanation (optional)"
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
            />
          </div>
          <textarea
            value={pyqForm.alternateApproach}
            onChange={e => setPyqForm(prev => ({ ...prev, alternateApproach: e.target.value }))}
            placeholder="Alternate Approach (AI) (optional, paste Gemini/ChatGPT output)"
            rows={3}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 mb-4"
          />

          <button
            onClick={handleCreatePyq}
            disabled={!pyqForm.exam || !pyqForm.subject || !pyqForm.chapter || !pyqForm.question}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
          >
            Add PYQ Question
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-lg font-semibold">Bulk Upload PYQs (JSON)</h3>
            <button
              onClick={handleCopyPyqTemplate}
              className="px-3 py-1 text-xs bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200 hover:bg-slate-600/50 transition-colors"
            >
              Copy JSON Format
            </button>
          </div>
          <div className="text-xs text-slate-400 mb-3 space-y-1">
            <p className="text-amber-200">Note: Solution thoda lamba aur easy to understand ho.</p>
            <p>exam: exact card name (e.g. JEE Main, JEE Advanced) — required</p>
            <p>year: number (e.g. 2023) — optional</p>
            <p>subject: Physics/Chemistry/Mathematics — required</p>
            <p>chapter: exact chapter name from the list — required</p>
            <p>difficulty: Easy/Medium/Hard — optional (default Medium)</p>
            <p>question: text/LaTeX — required</p>
            <p>options: array of strings — optional</p>
            <p>correctAnswer: 0-based index (0,1,2,3) — required</p>
            <p>solution: text/LaTeX — optional</p>
            <p>explanation: text/LaTeX — optional</p>
            <p>alternateApproach: text/LaTeX — optional (paste Gemini/ChatGPT output)</p>
          </div>
          {bulkTemplateStatus && (
            <p className="text-xs text-slate-400 mb-2">{bulkTemplateStatus}</p>
          )}
          <pre className="w-full px-4 py-3 bg-slate-900/40 border border-slate-700 rounded-xl text-xs text-slate-300 overflow-x-auto mb-3">
            {PYQ_BULK_TEMPLATE}
          </pre>
          <textarea
            value={bulkJson}
            onChange={e => setBulkJson(e.target.value)}
            placeholder={`[\n  {\n    \"exam\": \"JEE Main\",\n    \"year\": 2023,\n    \"subject\": \"Physics\",\n    \"chapter\": \"Electrostatics\",\n    \"difficulty\": \"Medium\",\n    \"question\": \"Two point charges ...\",\n    \"options\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],\n    \"correctAnswer\": 1,\n    \"solution\": \"...\",\n    \"explanation\": \"...\",\n    \"alternateApproach\": \"...\"\n  }\n]`}
            rows={10}
            className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 mb-3"
          />
          {bulkStatus && (
            <p className="text-sm text-slate-300 mb-3">{bulkStatus}</p>
          )}
          <button
            onClick={handleBulkUpload}
            disabled={!bulkJson.trim()}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
          >
            Upload PYQs
          </button>
        </div>
      )}
    </motion.div>
  )
}

// Analytics Component
function Analytics() {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [leaderboard, setLeaderboard] = useState<any>(null)
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)

  useEffect(() => {
    api.analytics.dashboard()
      .then(data => setAnalytics(data.analytics))
      .finally(() => setLoading(false))

    api.analytics.leaderboard(10)
      .then(data => setLeaderboard(data.leaderboard))
      .finally(() => setLeaderboardLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Rank Prediction */}
      {analytics?.rankPrediction && (
        <div className="bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-2xl p-6 border border-blue-500/30">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Rank Prediction
          </h3>
          <div className="text-center mb-4">
            <p className="text-4xl font-bold">
              <span className="text-blue-400">{analytics.rankPrediction.rankRange.min?.toLocaleString()}</span>
              <span className="text-slate-400"> - </span>
              <span className="text-purple-400">{analytics.rankPrediction.rankRange.max?.toLocaleString()}</span>
            </p>
            <p className="text-slate-400 mt-1">Expected JEE Main Rank</p>
            <p className="text-sm text-slate-500 mt-1">
              Percentile: {analytics.rankPrediction.percentile?.toFixed(2)}% | Confidence: {analytics.rankPrediction.confidence}
            </p>
          </div>
          {analytics.rankPrediction.recommendations?.length > 0 && (
            <div className="space-y-2">
              {analytics.rankPrediction.recommendations.map((rec: string, i: number) => (
                <p key={i} className="text-sm text-slate-300 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-blue-400" />
                  {rec}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subject Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {analytics?.subjectAnalytics?.map((subject: any) => (
          <div key={subject.subject} className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <h4 className="font-semibold mb-4">{subject.subject}</h4>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Accuracy</span>
                <span className="font-medium">{subject.accuracy}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Questions</span>
                <span className="font-medium">{subject.questionsSolved}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Avg Time</span>
                <span className="font-medium">{subject.avgTimePerQuestion}s</span>
              </div>
            </div>

            {subject.weakChapters?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-2">Weak Chapters:</p>
                <div className="flex flex-wrap gap-1">
                  {subject.weakChapters.slice(0, 2).map((ch: string) => (
                    <span key={ch} className="px-2 py-1 bg-orange-500/10 text-orange-400 text-xs rounded">
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Leaderboard
          </h3>
          <span className="text-xs text-slate-400">Top 10 by accuracy</span>
        </div>

        {leaderboardLoading ? (
          <div className="flex items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
            />
          </div>
        ) : leaderboard?.leaders?.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-700">
                    <th className="py-2 pr-2 font-medium">Rank</th>
                    <th className="py-2 pr-2 font-medium">Student</th>
                    <th className="py-2 pr-2 font-medium text-right">Accuracy</th>
                    <th className="py-2 pr-2 font-medium text-right">Questions</th>
                    <th className="py-2 font-medium text-right">Tests</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.leaders.map((entry: any) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-slate-800/60 ${entry.isYou ? 'bg-blue-500/10' : ''}`}
                    >
                      <td className="py-2 pr-2 font-medium">#{entry.rank}</td>
                      <td className="py-2 pr-2">{entry.name}{entry.isYou ? ' (You)' : ''}</td>
                      <td className="py-2 pr-2 text-right">{entry.accuracy}%</td>
                      <td className="py-2 pr-2 text-right">{entry.questionsSolved}</td>
                      <td className="py-2 text-right">{entry.totalTests}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leaderboard?.userRank && !leaderboard.leaders.some((entry: any) => entry.id === leaderboard.userRank.id) && (
              <div className="mt-4 text-sm text-slate-300">
                Your Rank: <span className="font-medium">#{leaderboard.userRank.rank}</span> • Accuracy {leaderboard.userRank.accuracy}% • Questions {leaderboard.userRank.questionsSolved}
              </div>
            )}
          </>
        ) : (
          <div className="text-slate-400 text-sm">No leaderboard data available yet.</div>
        )}
      </div>

      {/* AI Dependency */}
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          AI Dependency
        </h3>
        <p className="text-3xl font-bold">{analytics?.aiDependency || 0}%</p>
        <p className="text-slate-400 text-sm mt-1">
          Ratio of AI queries to practice questions solved
        </p>
      </div>
    </motion.div>
  )
}

// Doubt Clearing Component
function DoubtClearing({ user }: { user: User | null }) {
  const [loading, setLoading] = useState(true)
  const [doubts, setDoubts] = useState<DoubtItem[]>([])
  const [selectedDoubtId, setSelectedDoubtId] = useState<string | null>(null)
  const [replies, setReplies] = useState<DoubtReply[]>([])
  const [repliesLoading, setRepliesLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all')
  const [showAskModal, setShowAskModal] = useState(false)
  const [submittingDoubt, setSubmittingDoubt] = useState(false)
  const [replyInput, setReplyInput] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [unrestricting, setUnrestricting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [suspensionNotice, setSuspensionNotice] = useState<{ until: string; reason?: string | null } | null>(null)
  const [doubtForm, setDoubtForm] = useState({
    title: '',
    subject: 'Physics',
    chapter: '',
    description: '',
  })

  const selectedDoubt = doubts.find(doubt => doubt.id === selectedDoubtId) || null
  const isAdmin = user?.role === 'admin'
  const isGuestUser = !!user?.isGuest
  const selectedAuthorSuspendedUntil = selectedDoubt?.author?.suspendedUntil || null
  const selectedAuthorSuspended =
    !!selectedAuthorSuspendedUntil && new Date(selectedAuthorSuspendedUntil).getTime() > Date.now()

  const formatSuspension = (iso: string) => {
    const diffMs = Math.max(0, new Date(iso).getTime() - Date.now())
    const mins = Math.ceil(diffMs / 60000)
    if (mins <= 1) return 'less than 1 minute'
    if (mins < 60) return `${mins} minutes`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`
  }

  const handleApiError = useCallback((err: any, fallbackMessage: string) => {
    const msg = typeof err?.message === 'string' ? err.message : fallbackMessage
    setErrorMessage(msg)
    if (err?.code === 'SUSPENDED' && err?.details?.suspendedUntil) {
      setSuspensionNotice({
        until: String(err.details.suspendedUntil),
        reason: typeof err.details?.suspensionReason === 'string' ? err.details.suspensionReason : null,
      })
    }
  }, [])

  const loadDoubts = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const data = await api.doubts.list(search.trim(), subjectFilter, statusFilter)
      const fetched = Array.isArray(data?.doubts) ? data.doubts as DoubtItem[] : []
      setDoubts(fetched)
      setSelectedDoubtId(prev => {
        if (fetched.length === 0) return null
        if (prev && fetched.some(d => d.id === prev)) return prev
        return fetched[0].id
      })
    } catch (err: any) {
      setDoubts([])
      setSelectedDoubtId(null)
      handleApiError(err, 'Failed to load doubts.')
    } finally {
      setLoading(false)
    }
  }, [handleApiError, search, statusFilter, subjectFilter])

  useEffect(() => {
    loadDoubts()
  }, [loadDoubts])

  const loadReplies = useCallback(async (doubtId: string) => {
    setRepliesLoading(true)
    setErrorMessage('')
    try {
      const data = await api.doubts.replies(doubtId)
      setReplies(Array.isArray(data?.replies) ? data.replies as DoubtReply[] : [])
    } catch (err: any) {
      setReplies([])
      handleApiError(err, 'Failed to load replies.')
    } finally {
      setRepliesLoading(false)
    }
  }, [handleApiError])

  useEffect(() => {
    if (!selectedDoubtId) {
      setReplies([])
      return
    }
    loadReplies(selectedDoubtId)
  }, [loadReplies, selectedDoubtId])

  const handleCreateDoubt = async () => {
    if (isGuestUser) {
      setErrorMessage('Guest users can view doubts only. Please sign in to ask a doubt.')
      return
    }
    if (!doubtForm.title.trim() || !doubtForm.description.trim() || !doubtForm.subject.trim()) return

    setSubmittingDoubt(true)
    setErrorMessage('')
    try {
      const data = await api.doubts.create({
        title: doubtForm.title.trim(),
        description: doubtForm.description.trim(),
        subject: doubtForm.subject.trim(),
        chapter: doubtForm.chapter.trim() || undefined,
      })

      setShowAskModal(false)
      setDoubtForm({
        title: '',
        subject: doubtForm.subject,
        chapter: '',
        description: '',
      })

      await loadDoubts()
      if (data?.doubt?.id) {
        setSelectedDoubtId(String(data.doubt.id))
      }
    } catch (err: any) {
      handleApiError(err, 'Failed to submit doubt.')
    } finally {
      setSubmittingDoubt(false)
    }
  }

  const handleAddReply = async () => {
    if (isGuestUser) {
      setErrorMessage('Guest users can view doubts only. Please sign in to answer.')
      return
    }
    if (!selectedDoubtId || !replyInput.trim()) return
    setSubmittingReply(true)
    setErrorMessage('')
    try {
      await api.doubts.addReply(selectedDoubtId, replyInput.trim())
      setReplyInput('')
      await loadReplies(selectedDoubtId)
      await loadDoubts()
    } catch (err: any) {
      handleApiError(err, 'Failed to post reply.')
    } finally {
      setSubmittingReply(false)
    }
  }

  const handleUnrestrictAuthor = async () => {
    if (!isAdmin || !selectedDoubt?.author?.id) return
    setUnrestricting(true)
    setErrorMessage('')
    try {
      await api.admin.unrestrictUser(selectedDoubt.author.id)
      await loadDoubts()
    } catch (err: any) {
      handleApiError(err, 'Failed to remove restriction for this user.')
    } finally {
      setUnrestricting(false)
    }
  }

  const askBlocked = !!suspensionNotice || isGuestUser

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-[calc(100vh-140px)] flex flex-col"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Doubt Clearing Forum</h2>
          <p className="text-slate-400 mt-1">Get help from community, admin, and AI Buddy.</p>
        </div>
        <button
          onClick={() => setShowAskModal(true)}
          disabled={askBlocked}
          className="px-5 py-2.5 rounded-xl bg-linear-to-r from-blue-500 to-purple-500 font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Ask a Doubt
        </button>
      </div>

      {suspensionNotice && (
        <div className="mb-4 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200">
          <p className="font-medium">You are temporarily suspended for policy violation.</p>
          <p className="text-sm mt-1">
            Retry after {formatSuspension(suspensionNotice.until)} ({new Date(suspensionNotice.until).toLocaleString()}).
          </p>
          {suspensionNotice.reason && <p className="text-sm mt-1">Reason: {suspensionNotice.reason}</p>}
        </div>
      )}

      {isGuestUser && (
        <div className="mb-4 p-4 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-200">
          Guest mode is read-only. You can browse doubts, but cannot ask or answer.
          Please sign in with a regular account to participate.
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-200 text-sm">
          {errorMessage}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="bg-slate-900/45 border border-slate-700 rounded-2xl p-4 flex flex-col min-h-0">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search doubts..."
              className="w-full pl-10 pr-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <select
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Subjects</option>
              {Object.keys(SUBJECTS).map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'pending' | 'resolved')}
              className="px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex-1 overflow-auto space-y-2 pr-1">
            {loading ? (
              <div className="text-slate-400 text-sm">Loading doubts...</div>
            ) : doubts.length === 0 ? (
              <div className="text-slate-400 text-sm">No doubts found.</div>
            ) : (
              doubts.map(doubt => (
                <button
                  key={doubt.id}
                  onClick={() => setSelectedDoubtId(doubt.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    doubt.id === selectedDoubtId
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/40 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      doubt.status === 'resolved'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {doubt.status}
                    </span>
                    <span className="text-xs text-slate-400">{doubt.subject}</span>
                  </div>
                  <p className="font-medium line-clamp-1">{doubt.title}</p>
                  <p className="text-sm text-slate-400 mt-1 line-clamp-2">{doubt.description}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{doubt.answerCount} answers</span>
                    <span>{new Date(doubt.updatedAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-900/45 border border-slate-700 rounded-2xl p-5 min-h-0 flex flex-col">
          {!selectedDoubt ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
              <MessageSquare className="w-12 h-12 mb-3 text-slate-500" />
              <p className="text-xl font-semibold text-white">Select a doubt</p>
              <p className="mt-1">Choose from left panel to view details and discussion.</p>
            </div>
          ) : (
            <>
              <div className="pb-4 border-b border-slate-700">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    selectedDoubt.status === 'resolved'
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-yellow-500/20 text-yellow-300'
                  }`}>
                    {selectedDoubt.status}
                  </span>
                  <span className="text-xs text-slate-400">{selectedDoubt.subject}</span>
                  {selectedDoubt.chapter && (
                    <span className="text-xs text-slate-500">| {selectedDoubt.chapter}</span>
                  )}
                </div>
                <h3 className="text-2xl font-semibold">{selectedDoubt.title}</h3>
                <p className="text-slate-300 mt-2">{selectedDoubt.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Asked by {selectedDoubt.author.name} | {new Date(selectedDoubt.createdAt).toLocaleString()}
                </p>
                {selectedAuthorSuspended && (
                  <div className="mt-3 p-3 rounded-lg border border-red-500/40 bg-red-500/10 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-red-200">
                        User is restricted until {new Date(String(selectedAuthorSuspendedUntil)).toLocaleString()}.
                      </p>
                      {selectedDoubt.author.suspensionReason && (
                        <p className="text-xs text-red-300 mt-1">Reason: {selectedDoubt.author.suspensionReason}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={handleUnrestrictAuthor}
                        disabled={unrestricting}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {unrestricting ? 'Unrestricting...' : 'Unrestrict User'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-auto py-4 space-y-3">
                {repliesLoading ? (
                  <div className="text-slate-400 text-sm">Loading replies...</div>
                ) : replies.length === 0 ? (
                  <div className="text-slate-400 text-sm">No replies yet. Be the first to help.</div>
                ) : (
                  replies.map(reply => (
                    <div
                      key={reply.id}
                      className={`p-3 rounded-xl border ${
                        reply.authorType === 'ai'
                          ? 'border-purple-500/40 bg-purple-500/10'
                          : reply.authorType === 'admin'
                            ? 'border-blue-500/40 bg-blue-500/10'
                            : 'border-slate-700 bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">
                          {reply.authorName}
                          {reply.authorType === 'ai' && <span className="text-purple-300 text-xs ml-2">AI</span>}
                          {reply.authorType === 'admin' && <span className="text-blue-300 text-xs ml-2">Admin</span>}
                        </span>
                        <span className="text-xs text-slate-500">{new Date(reply.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <MathText text={reply.content} />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-slate-700">
                <textarea
                  value={replyInput}
                  onChange={e => setReplyInput(e.target.value)}
                  placeholder={
                    isGuestUser
                      ? 'Guest users can only view doubts. Sign in to answer.'
                      : askBlocked
                        ? 'Suspended users cannot post replies right now.'
                        : 'Write your reply...'
                  }
                  disabled={askBlocked || submittingReply}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleAddReply}
                    disabled={askBlocked || submittingReply || !replyInput.trim()}
                    className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingReply ? 'Posting...' : 'Post Reply'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAskModal && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-6"
            >
              <h3 className="text-2xl font-semibold mb-1">Ask Your Doubt</h3>
              <p className="text-sm text-slate-400 mb-4">
                Community, admin, and AI can help. Abusive/slang content leads to auto-removal and temporary suspension.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm mb-1 text-slate-300">Title</label>
                  <input
                    value={doubtForm.title}
                    onChange={e => setDoubtForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Briefly describe your doubt"
                    className="w-full px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1 text-slate-300">Subject</label>
                    <select
                      value={doubtForm.subject}
                      onChange={e => setDoubtForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      {Object.keys(SUBJECTS).map(subject => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1 text-slate-300">Chapter (optional)</label>
                    <input
                      value={doubtForm.chapter}
                      onChange={e => setDoubtForm(prev => ({ ...prev, chapter: e.target.value }))}
                      placeholder="e.g., Electrostatics"
                      className="w-full px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-slate-300">Description</label>
                  <textarea
                    value={doubtForm.description}
                    onChange={e => setDoubtForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the doubt in detail. Include known data, target, and your attempted approach."
                    rows={5}
                    className="w-full px-3 py-2.5 bg-slate-700/40 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setShowAskModal(false)}
                  disabled={submittingDoubt}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDoubt}
                  disabled={submittingDoubt || !doubtForm.title.trim() || !doubtForm.description.trim()}
                  className="px-4 py-2 rounded-lg bg-linear-to-r from-blue-500 to-purple-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingDoubt ? 'Submitting...' : 'Submit Doubt'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Idea Box Component
function IdeaChat({ user }: { user: User | null }) {
  const [messages, setMessages] = useState<IdeaMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  const normalizeMessages = useCallback((raw: any[]): IdeaMessage[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((item): IdeaMessage => ({
        id: String(item?.id || ''),
        userId: String(item?.userId || ''),
        senderType: item?.senderType === 'admin' ? 'admin' : 'user',
        senderName: typeof item?.senderName === 'string' ? item.senderName : null,
        message: String(item?.message || ''),
        createdAt: String(item?.createdAt || new Date().toISOString()),
      }))
      .filter(item => Boolean(item.id && item.message))
  }, [])

  const loadIdeas = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.ideas.messages()
      const raw = Array.isArray(data?.conversation?.messages) ? data.conversation.messages : []
      setMessages(normalizeMessages(raw))
    } catch (err: any) {
      setMessages([])
      setError(err?.message || 'Unable to load ideas right now.')
    } finally {
      setLoading(false)
    }
  }, [normalizeMessages])

  useEffect(() => {
    void loadIdeas()
  }, [loadIdeas])

  useEffect(() => {
    if (!chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const data = await api.ideas.sendMessage(input.trim())
      const message = data?.message
      if (message?.id) {
        setMessages(prev => [
          ...prev,
          {
            id: String(message.id),
            userId: String(message.userId || user?.id || ''),
            senderType: message.senderType === 'admin' ? 'admin' : 'user',
            senderName: typeof message.senderName === 'string' ? message.senderName : null,
            message: String(message.message || input.trim()),
            createdAt: String(message.createdAt || new Date().toISOString()),
          },
        ])
      } else {
        await loadIdeas()
      }
      setInput('')
    } catch (err: any) {
      setError(err?.message || 'Unable to send your idea.')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-300" />
            Idea Box
          </h3>
          <button
            type="button"
            onClick={loadIdeas}
            disabled={loading}
            className="px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-700/60 hover:bg-slate-700/90 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Share your product ideas, feature requests, or improvements. We’ll review them.
        </p>

        {error && (
          <p className="mt-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-3 text-sm text-slate-400">Loading ideas...</p>
        ) : (
          <div
            ref={chatScrollRef}
            className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 max-h-80 overflow-y-auto space-y-2"
          >
            {messages.length ? (
              messages.map(message => {
                const isSelf = message.senderType === 'user'
                const bubbleClass = isSelf
                  ? 'ml-auto bg-amber-500/20 border-amber-500/30 text-amber-100'
                  : 'mr-auto bg-slate-800/70 border-slate-600 text-slate-100'
                const senderLabel = isSelf ? 'You' : (message.senderName || 'Admin')

                return (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${bubbleClass}`}
                  >
                    <p className="text-[11px] opacity-80 mb-1">
                      {senderLabel} | {new Date(message.createdAt).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap">{message.message}</p>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-slate-400">No ideas yet. Start the conversation.</p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={2}
            placeholder="Type your idea..."
            className="flex-1 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-600 focus:outline-none focus:border-amber-400 resize-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium self-end"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// AI Buddy Component
function AITutor({ user }: { user: User | null }) {
  const AI_TUTOR_STORAGE_KEY_BASE = 'jee_study_buddy_ai_tutor_threads_v1'
  const aiTutorStorageKey = useMemo(
    () => `${AI_TUTOR_STORAGE_KEY_BASE}_${user?.id || 'anon'}`,
    [user?.id]
  )
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [mode, setMode] = useState<AIMode>('friendly')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [shareStatus, setShareStatus] = useState('')
  const [threadsHydrated, setThreadsHydrated] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const firebaseSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buildThreadTitle = useCallback((threadMessages: Message[], threadSubject: string, threadChapter: string) => {
    const firstUserMessage = threadMessages.find(
      msg => msg.role === 'user' && msg.content.trim().length > 0
    )

    if (firstUserMessage) return firstUserMessage.content.trim().slice(0, 48)
    if (threadChapter) return threadChapter.slice(0, 48)
    if (threadSubject) return `${threadSubject} chat`.slice(0, 48)
    return 'New Chat'
  }, [])

  const createThread = useCallback((seed?: Partial<Pick<ChatThread, 'subject' | 'chapter' | 'mode'>>): ChatThread => {
    const timestamp = Date.now()
    const modeValue: AIMode =
      seed?.mode === 'strict' || seed?.mode === 'friendly' || seed?.mode === 'exam'
        ? seed.mode
        : 'friendly'
    const subjectValue = seed?.subject || ''
    const chapterValue = seed?.chapter || ''

    return {
      id: `chat_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      title: buildThreadTitle([], subjectValue, chapterValue),
      mode: modeValue,
      subject: subjectValue,
      chapter: chapterValue,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }, [buildThreadTitle])

  const normalizeThreads = useCallback((raw: any): ChatThread[] => {
    if (!Array.isArray(raw)) return []

    return raw
      .map((thread: any) => {
        if (!thread || typeof thread !== 'object') return null

        const createdAt = typeof thread.createdAt === 'number' ? thread.createdAt : Date.now()
        const updatedAt = typeof thread.updatedAt === 'number' ? thread.updatedAt : createdAt
        const subjectValue = typeof thread.subject === 'string' ? thread.subject : ''
        const chapterValue = typeof thread.chapter === 'string' ? thread.chapter : ''
        const modeValue: AIMode =
          thread.mode === 'strict' || thread.mode === 'friendly' || thread.mode === 'exam'
            ? thread.mode
            : 'friendly'

        const messagesValue: Message[] = Array.isArray(thread.messages)
          ? thread.messages
              .map((msg: any) => {
                if (!msg || typeof msg !== 'object') return null
                if (msg.role !== 'user' && msg.role !== 'assistant') return null
                if (typeof msg.content !== 'string') return null
                return {
                  role: msg.role,
                  content: msg.content,
                  ...(typeof msg.thinking === 'string' ? { thinking: msg.thinking } : {}),
                } as Message
              })
              .filter((msg: Message | null): msg is Message => !!msg)
          : []

        return {
          id: typeof thread.id === 'string' && thread.id
            ? thread.id
            : `chat_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
          title: typeof thread.title === 'string' && thread.title.trim().length > 0
            ? thread.title.trim().slice(0, 48)
            : buildThreadTitle(messagesValue, subjectValue, chapterValue),
          mode: modeValue,
          subject: subjectValue,
          chapter: chapterValue,
          messages: messagesValue,
          createdAt,
          updatedAt,
        } as ChatThread
      })
      .filter((thread: ChatThread | null): thread is ChatThread => !!thread)
      .sort((a: ChatThread, b: ChatThread) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
  }, [buildThreadTitle])

  const selectThread = useCallback((thread: ChatThread) => {
    setActiveThreadId(thread.id)
    setSubject(thread.subject)
    setChapter(thread.chapter)
    setMode(thread.mode)
    setMessages(thread.messages)
    setSessionStartedAt(thread.createdAt)
    setInput('')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    const hydrate = async () => {
      setThreadsHydrated(false)
      let normalized: ChatThread[] = []

      if (user?.id) {
        try {
          const snapshot = await getDoc(doc(firebaseDb, 'aiTutorHistory', user.id))
          if (snapshot.exists()) {
            const data = snapshot.data()
            const rawThreads = Array.isArray(data?.threads) ? data.threads : data
            normalized = normalizeThreads(rawThreads)
          }
        } catch {
          normalized = []
        }
      }

      if (normalized.length === 0) {
        try {
          const raw = window.localStorage.getItem(aiTutorStorageKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            normalized = normalizeThreads(parsed)
          }
        } catch {
          normalized = []
        }
      }

      if (normalized.length === 0) {
        normalized = [createThread()]
      }

      if (!cancelled) {
        setThreads(normalized)
        selectThread(normalized[0])
        setThreadsHydrated(true)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [aiTutorStorageKey, createThread, normalizeThreads, selectThread, user?.id])

  useEffect(() => {
    if (!threadsHydrated || typeof window === 'undefined') return

    if (threads.length === 0) {
      window.localStorage.removeItem(aiTutorStorageKey)
      return
    }

    window.localStorage.setItem(aiTutorStorageKey, JSON.stringify(threads.slice(0, 50)))
  }, [aiTutorStorageKey, threads, threadsHydrated])

  useEffect(() => {
    if (!threadsHydrated || !user?.id) return

    if (firebaseSaveRef.current) {
      clearTimeout(firebaseSaveRef.current)
    }

    firebaseSaveRef.current = setTimeout(() => {
      void setDoc(
        doc(firebaseDb, 'aiTutorHistory', user.id),
        {
          threads: threads.slice(0, 50),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
        // Ignore sync errors; local storage remains the fallback.
      })
    }, 500)

    return () => {
      if (firebaseSaveRef.current) {
        clearTimeout(firebaseSaveRef.current)
      }
    }
  }, [threads, threadsHydrated, user?.id])

  useEffect(() => {
    if (!threadsHydrated || !activeThreadId) return

    setThreads(prev => {
      const index = prev.findIndex(thread => thread.id === activeThreadId)
      if (index < 0) return prev

      const current = prev[index]
      const nextTitle = buildThreadTitle(messages, subject, chapter)
      const unchanged =
        current.messages === messages &&
        current.subject === subject &&
        current.chapter === chapter &&
        current.mode === mode &&
        current.title === nextTitle

      if (unchanged) return prev

      const updated: ChatThread = {
        ...current,
        title: nextTitle,
        subject,
        chapter,
        mode,
        messages,
        updatedAt: Date.now(),
      }

      const rest = prev.filter(thread => thread.id !== activeThreadId)
      return [updated, ...rest].slice(0, 50)
    })
  }, [activeThreadId, buildThreadTitle, chapter, messages, mode, subject, threadsHydrated])

  useEffect(() => {
    if (!shareStatus) return
    const timer = setTimeout(() => setShareStatus(''), 2500)
    return () => clearTimeout(timer)
  }, [shareStatus])

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 50)
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom()
    }
  }, [messages, scrollToBottom])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    setMessages(prev => [...prev, { role: 'user', content: userMessage }, { role: 'assistant', content: '', thinking: '' }])

    chatContainerRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })

    try {
      await api.ai.chatStream(
        userMessage,
        subject,
        chapter,
        mode,
        {
          onDelta: (delta) => {
            setMessages(prev => {
              const updated = [...prev]
              const lastMsg = updated[updated.length - 1]
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content += delta
              }
              return updated
            })
          },
          onThinking: (thinking) => {
            setMessages(prev => {
              const updated = [...prev]
              const lastMsg = updated[updated.length - 1]
              if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.thinking = thinking
              }
              return updated
            })
          }
        },
        sessionStartedAt ?? undefined
      )
    } catch (err: any) {
      setMessages(prev => {
        const updated = [...prev]
        const lastMsg = updated[updated.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = getGuestAiUpgradeMessage(err, 'Sorry, I encountered an error while generating a response.')
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const startNewChat = () => {
    if (loading) return
    const freshThread = createThread({ subject, chapter, mode })
    setThreads(prev => [freshThread, ...prev].slice(0, 50))
    selectThread(freshThread)
    setShowSettings(false)
    setHistorySidebarOpen(true)
  }

  const handleDeleteThread = (threadId: string) => {
    const remaining = threads.filter(thread => thread.id !== threadId)

    if (remaining.length === 0) {
      const fresh = createThread()
      setThreads([fresh])
      selectThread(fresh)
      return
    }

    setThreads(remaining)

    if (threadId === activeThreadId) {
      selectThread(remaining[0])
    }
  }

  const handleShareThread = async (thread: ChatThread) => {
    const header = [
      thread.title || 'AI Buddy Chat',
      thread.subject ? `Subject: ${thread.subject}` : '',
      thread.chapter ? `Chapter: ${thread.chapter}` : '',
      `Mode: ${thread.mode}`,
      `Updated: ${new Date(thread.updatedAt).toLocaleString()}`,
    ].filter(Boolean).join('\n')

    const body = thread.messages.length > 0
      ? thread.messages.map(msg => `${msg.role === 'user' ? 'You' : 'AI Buddy'}: ${msg.content}`).join('\n\n')
      : 'No messages in this chat yet.'

    const shareText = `${header}\n\n${body}`

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: thread.title || 'AI Buddy Chat',
          text: shareText,
        })
        setShareStatus('Chat shared.')
        return
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText)
        setShareStatus('Chat copied to clipboard.')
        return
      }

      setShareStatus('Sharing is not supported on this browser.')
    } catch {
      setShareStatus('Unable to share this chat.')
    }
  }

  const quickPrompts = [
    'Explain this concept in detail',
    'Give me a practice problem',
    'What are common mistakes in this topic?',
    'Help me solve this question'
  ]

  const activeThread = threads.find(thread => thread.id === activeThreadId)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-[calc(100vh-140px)] flex flex-col"
    >
      <div className="bg-slate-800/50 rounded-t-2xl p-4 border border-slate-700 border-b-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">AI Buddy</h3>
              <p className="text-xs text-slate-400">Your personal JEE mentor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistorySidebarOpen(prev => !prev)}
              className={`p-2 rounded-lg transition-colors ${
                historySidebarOpen
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'hover:bg-slate-700/50'
              }`}
              title={historySidebarOpen ? 'Close chats menu' : 'Open chats menu'}
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mb-4 p-4 bg-slate-700/30 rounded-xl border border-slate-600"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Subject</label>
                <select
                  value={subject}
                  onChange={e => {
                    setSubject(e.target.value)
                    setChapter('')
                  }}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                >
                  <option value="">Any Subject</option>
                  {Object.keys(SUBJECTS).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Chapter</label>
                <select
                  value={chapter}
                  onChange={e => setChapter(e.target.value)}
                  disabled={!subject}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm disabled:opacity-50"
                >
                  <option value="">Any Chapter</option>
                  {subject && SUBJECTS[subject as keyof typeof SUBJECTS].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">AI Mode</label>
                <select
                  value={mode}
                  onChange={e => setMode(e.target.value as AIMode)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm"
                >
                  <option value="exam">Exam Focus</option>
                  <option value="friendly">Friendly</option>
                  <option value="strict">Strict</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Sparkles className="w-3 h-3" />
          <span>Current mode:</span>
          <span className={`px-2 py-0.5 rounded-full ${
            mode === 'exam' ? 'bg-blue-500/20 text-blue-300' :
            mode === 'friendly' ? 'bg-green-500/20 text-green-300' :
            'bg-orange-500/20 text-orange-300'
          }`}>
            {mode === 'exam' ? 'Exam Focus' : mode === 'friendly' ? 'Friendly' : 'Strict'}
          </span>
          {subject && <span>| {subject}</span>}
          {chapter && <span>| {chapter}</span>}
        </div>
        {activeThread && (
          <p className="mt-2 text-xs text-slate-500 truncate">Active chat: {activeThread.title}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-slate-800/30 border border-slate-700 border-t-0 rounded-b-2xl overflow-hidden flex">
        <AnimatePresence initial={false}>
          {historySidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="h-full bg-slate-900/40 border-r border-slate-700 overflow-hidden shrink-0"
            >
              <div className="h-full flex flex-col">
                <div className="p-3 border-b border-slate-700 space-y-2">
                  <button
                    onClick={startNewChat}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">New Chat</span>
                  </button>
                  {shareStatus && (
                    <p className="text-xs text-slate-300">{shareStatus}</p>
                  )}
                </div>

                <div className="flex-1 overflow-auto p-3 space-y-2">
                  {threads.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">No chats yet.</p>
                  ) : (
                    threads.map(thread => (
                      <div
                        key={thread.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectThread(thread)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectThread(thread)
                          }
                        }}
                        className={`p-3 rounded-xl border transition-colors ${
                          thread.id === activeThreadId
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{thread.title || 'New Chat'}</p>
                            <p className="text-xs text-slate-400 truncate">
                              {thread.subject || 'Any Subject'}{thread.chapter ? ` | ${thread.chapter}` : ''}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {thread.messages.length} msgs | {new Date(thread.updatedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                handleShareThread(thread)
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
                              title="Share chat"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation()
                                handleDeleteThread(thread.id)
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                              title="Delete chat"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-auto p-4 space-y-4" ref={chatContainerRef}>
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-linear-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Welcome to AI Buddy!</h3>
                <p className="text-slate-400 text-sm mb-6 max-w-md">
                  Your friendly AI Buddy for JEE prep. Ask questions, get concept explanations, practice problems, and more.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-lg">
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(prompt)}
                      className="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-sm text-slate-300 transition-colors text-left"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-blue-500'
                      : 'bg-linear-to-br from-purple-500 to-blue-500'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className={`max-w-[80%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {msg.thinking && msg.role === 'assistant' && (
                      <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-xs text-yellow-400 mb-1">Thinking...</p>
                        <p className="text-xs text-slate-400 line-clamp-2">{msg.thinking}</p>
                      </div>
                    )}
                    <div className={`p-3 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-blue-500/20 border border-blue-500/30'
                        : 'bg-slate-700/50 border border-slate-600'
                    }`}>
                      {msg.role === 'assistant' && msg.content === '' && loading ? (
                        <div className="flex items-center gap-2 text-slate-400">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
                          />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <MathText text={msg.content} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-slate-700 bg-slate-800/50">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask me anything..."
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500 resize-none"
                  rows={1}
                  disabled={loading}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Teacher Dashboard Component
function TeacherDashboard({ user }: { user: User | null }) {
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [suspendedUsers, setSuspendedUsers] = useState<Array<{
    id: string
    name: string
    email: string
    role: string
    isGuest: boolean
    suspendedUntil: string
    suspensionReason: string | null
    suspensionMessagingDisabled: boolean
  }>>([])
  const [suspendedLoading, setSuspendedLoading] = useState(true)
  const [suspendedError, setSuspendedError] = useState('')
  const [activityUsers, setActivityUsers] = useState<AdminActivityUser[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [aiStatus, setAiStatus] = useState<AiStatusSnapshot | null>(null)
  const [aiStatusLoading, setAiStatusLoading] = useState(true)
  const [aiStatusError, setAiStatusError] = useState('')
  const [selectedSupportUserId, setSelectedSupportUserId] = useState<string | null>(null)
  const [selectedSupportConversation, setSelectedSupportConversation] = useState<SuspensionConversation | null>(null)
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportError, setSupportError] = useState('')
  const [adminReplyInput, setAdminReplyInput] = useState('')
  const [sendingAdminReply, setSendingAdminReply] = useState(false)
  const [adminChatMessages, setAdminChatMessages] = useState<AdminChatMessage[]>([])
  const [adminChatLoading, setAdminChatLoading] = useState(true)
  const [adminChatError, setAdminChatError] = useState('')
  const [adminChatInput, setAdminChatInput] = useState('')
  const [adminChatSending, setAdminChatSending] = useState(false)
  const [unrestrictingUserId, setUnrestrictingUserId] = useState<string | null>(null)
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null)
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false)
  const [suspendTargetUser, setSuspendTargetUser] = useState<AdminActivityUser | null>(null)
  const [suspendReason, setSuspendReason] = useState('Policy violation')
  const [suspendMinutes, setSuspendMinutes] = useState('60')
  const [questionForm, setQuestionForm] = useState({
    subject: '',
    chapter: '',
    difficulty: 'Medium',
    question: '',
    options: ['', '', '', ''],
    correctAnswer: '0'
  })
  const [questionLibrary, setQuestionLibrary] = useState<any[]>([])
  const [questionLibraryLoading, setQuestionLibraryLoading] = useState(false)
  const [questionLibraryError, setQuestionLibraryError] = useState('')
  const [openQuestionFolders, setOpenQuestionFolders] = useState<Record<string, boolean>>({})
  const [deletingFolderKey, setDeletingFolderKey] = useState<string | null>(null)
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null)
  const [deletingAllQuestions, setDeletingAllQuestions] = useState(false)
  const [selectedYears, setSelectedYears] = useState<string[]>([])
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const isAdmin = user?.role === 'admin'
  const UNASSIGNED_EXAM_KEY = '__unassigned__'
  const NO_YEAR_KEY = '__no_year__'
  const adminChatScrollRef = useRef<HTMLDivElement | null>(null)

  const loadSuspendedUsers = useCallback(async () => {
    if (!isAdmin) {
      setSuspendedUsers([])
      setSuspendedLoading(false)
      return
    }

    setSuspendedLoading(true)
    setSuspendedError('')
    try {
      const data = await api.admin.suspendedUsers()
      const rawUsers = Array.isArray(data?.users) ? data.users : []
      const normalized = rawUsers.map((item: any) => ({
        id: String(item?.id || ''),
        name: String(item?.name || 'Unknown'),
        nickname: typeof item?.nickname === 'string' && item.nickname.trim().length > 0 ? item.nickname : null,
        email: String(item?.email || ''),
        role: String(item?.role || 'student'),
        isGuest: Boolean(item?.isGuest),
        suspendedUntil: String(item?.suspendedUntil || ''),
        suspensionReason:
          typeof item?.suspensionReason === 'string' && item.suspensionReason.trim().length > 0
            ? item.suspensionReason
            : null,
        suspensionMessagingDisabled: Boolean(item?.suspensionMessagingDisabled),
      })).filter(item => item.id && item.suspendedUntil)
      setSuspendedUsers(normalized)
    } catch (err: any) {
      setSuspendedUsers([])
      setSuspendedError(err?.message || 'Failed to load blocked users.')
    } finally {
      setSuspendedLoading(false)
    }
  }, [isAdmin])

  const loadActivityUsers = useCallback(async () => {
    if (!isAdmin) {
      setActivityUsers([])
      setActivityLoading(false)
      return
    }

    setActivityLoading(true)
    setActivityError('')
    try {
      const data = await api.admin.activityUsers(250)
      const rawUsers = Array.isArray(data?.users) ? data.users : []
      const normalized = rawUsers.map((item: any) => ({
        id: String(item?.id || ''),
        name: String(item?.name || 'Unknown'),
        nickname: typeof item?.nickname === 'string' && item.nickname.trim().length > 0 ? item.nickname : null,
        email: String(item?.email || ''),
        role: String(item?.role || 'student'),
        isGuest: Boolean(item?.isGuest),
        createdAt: String(item?.createdAt || ''),
        isSuspended: Boolean(item?.isSuspended),
        suspendedUntil: typeof item?.suspendedUntil === 'string' ? item.suspendedUntil : null,
        suspensionReason:
          typeof item?.suspensionReason === 'string' && item.suspensionReason.trim().length > 0
            ? item.suspensionReason
            : null,
        suspensionMessagingDisabled: Boolean(item?.suspensionMessagingDisabled),
        questionsSolved: Number(item?.questionsSolved || 0),
        accuracy: Number(item?.accuracy || 0),
        aiInteractions: Number(item?.aiInteractions || 0),
        mockAttempts: Number(item?.mockAttempts || 0),
        doubtsAsked: Number(item?.doubtsAsked || 0),
        repliesGiven: Number(item?.repliesGiven || 0),
        appealMessages: Number(item?.appealMessages || 0),
        lastActivityAt: typeof item?.lastActivityAt === 'string' ? item.lastActivityAt : null,
      })).filter((item: AdminActivityUser) => item.id)
      setActivityUsers(normalized)
    } catch (err: any) {
      setActivityUsers([])
      setActivityError(err?.message || 'Failed to load user activity.')
    } finally {
      setActivityLoading(false)
    }
  }, [isAdmin])

  const loadQuestionLibrary = useCallback(async () => {
    if (!isAdmin) {
      setQuestionLibrary([])
      setQuestionLibraryLoading(false)
      return
    }

    setQuestionLibraryLoading(true)
    setQuestionLibraryError('')
    try {
      const data = await api.teacher.questions({ limit: 'all' })
      const items = Array.isArray(data?.questions) ? data.questions : []
      setQuestionLibrary(items)
    } catch (err: any) {
      setQuestionLibrary([])
      setQuestionLibraryError(err?.message || 'Failed to load questions.')
    } finally {
      setQuestionLibraryLoading(false)
    }
  }, [isAdmin])

  const loadSupportConversation = useCallback(async (targetUserId: string) => {
    if (!targetUserId) return
    setSupportLoading(true)
    setSupportError('')
    try {
      const data = await api.suspension.messages(targetUserId)
      const payload = data?.conversation
      if (!payload || !payload.user || !Array.isArray(payload.messages)) {
        throw new Error('Failed to load support messages.')
      }
      setSelectedSupportConversation({
        user: {
          id: String(payload.user.id),
          name: String(payload.user.name || 'Unknown'),
          role: String(payload.user.role || 'student'),
          isGuest: Boolean(payload.user.isGuest),
          suspendedUntil: typeof payload.user.suspendedUntil === 'string' ? payload.user.suspendedUntil : null,
          suspensionReason:
            typeof payload.user.suspensionReason === 'string' ? payload.user.suspensionReason : null,
          suspensionMessagingDisabled: Boolean(payload.user.suspensionMessagingDisabled),
        },
        messages: payload.messages.map((item: any) => ({
          id: String(item.id),
          userId: String(item.userId),
          senderType:
            item.senderType === 'admin' || item.senderType === 'system' ? item.senderType : 'user',
          senderName: typeof item.senderName === 'string' ? item.senderName : null,
          message: String(item.message || ''),
          createdAt: String(item.createdAt || new Date().toISOString()),
        })),
      })
      setSelectedSupportUserId(targetUserId)
    } catch (err: any) {
      setSupportError(err?.message || 'Failed to load support messages.')
      setSelectedSupportConversation(null)
      setSelectedSupportUserId(targetUserId)
    } finally {
      setSupportLoading(false)
    }
  }, [])

  const loadAdminChat = useCallback(async () => {
    if (!isAdmin) {
      setAdminChatMessages([])
      setAdminChatLoading(false)
      return
    }

    setAdminChatLoading(true)
    setAdminChatError('')
    try {
      const data = await api.admin.chatMessages(200)
      const rawMessages = Array.isArray(data?.messages) ? data.messages : []
      const normalized = rawMessages.map((item: any) => ({
        id: String(item?.id || ''),
        content: String(item?.content || ''),
        createdAt: String(item?.createdAt || new Date().toISOString()),
        sender: {
          id: String(item?.sender?.id || ''),
          name: String(item?.sender?.name || 'Admin'),
          role: String(item?.sender?.role || 'admin'),
        },
      })).filter((item: AdminChatMessage) => item.id && item.content)
      setAdminChatMessages(normalized)
    } catch (err: any) {
      setAdminChatMessages([])
      setAdminChatError(err?.message || 'Failed to load admin chat.')
    } finally {
      setAdminChatLoading(false)
    }
  }, [isAdmin])

  const loadAiStatus = useCallback(async () => {
    if (!isAdmin) {
      setAiStatus(null)
      setAiStatusLoading(false)
      return
    }

    setAiStatusLoading(true)
    setAiStatusError('')
    try {
      const data = await api.admin.aiStatus()
      setAiStatus(data?.status || null)
    } catch (err: any) {
      setAiStatus(null)
      setAiStatusError(err?.message || 'Failed to load AI status.')
    } finally {
      setAiStatusLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    api.teacher.students()
      .then(data => setAnalytics(data.analytics))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void loadSuspendedUsers()
    void loadActivityUsers()
    void loadAiStatus()
  }, [loadActivityUsers, loadAiStatus, loadSuspendedUsers])

  useEffect(() => {
    void loadQuestionLibrary()
  }, [loadQuestionLibrary])

  useEffect(() => {
    void loadAdminChat()
  }, [loadAdminChat])

  useEffect(() => {
    if (!adminChatScrollRef.current) return
    adminChatScrollRef.current.scrollTop = adminChatScrollRef.current.scrollHeight
  }, [adminChatMessages])

  const handleAddQuestion = async () => {
    try {
      await api.teacher.createQuestion({
        ...questionForm,
        options: questionForm.options,
        type: 'single'
      })
      setShowQuestionForm(false)
      setQuestionForm({
        subject: '',
        chapter: '',
        difficulty: 'Medium',
        question: '',
        options: ['', '', '', ''],
        correctAnswer: '0'
      })
      if (isAdmin) {
        await loadQuestionLibrary()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const toggleQuestionFolder = (key: string) => {
    setOpenQuestionFolders(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleDeleteAllQuestions = async () => {
    if (!isAdmin) return
    const confirmed = window.confirm('Delete ALL questions? This cannot be undone.')
    if (!confirmed) return
    setDeletingAllQuestions(true)
    setQuestionLibraryError('')
    try {
      await api.teacher.deleteQuestions({ all: true })
      await loadQuestionLibrary()
    } catch (err: any) {
      setQuestionLibraryError(err?.message || 'Failed to delete questions.')
    } finally {
      setDeletingAllQuestions(false)
    }
  }

  const handleDeleteExamFolder = async (key: string, label: string) => {
    if (!isAdmin) return
    const confirmed = window.confirm(`Delete all questions inside "${label}"?`)
    if (!confirmed) return
    setDeletingFolderKey(key)
    setQuestionLibraryError('')
    try {
      await api.teacher.deleteQuestions({ exam: key })
      await loadQuestionLibrary()
    } catch (err: any) {
      setQuestionLibraryError(err?.message || 'Failed to delete questions.')
    } finally {
      setDeletingFolderKey(null)
    }
  }

  const handleDeleteSingleQuestion = async (questionId: string) => {
    if (!isAdmin) return
    const confirmed = window.confirm('Delete this question?')
    if (!confirmed) return
    setDeletingQuestionId(questionId)
    setQuestionLibraryError('')
    try {
      await api.teacher.deleteQuestions({ id: questionId })
      await loadQuestionLibrary()
    } catch (err: any) {
      setQuestionLibraryError(err?.message || 'Failed to delete question.')
    } finally {
      setDeletingQuestionId(null)
    }
  }

  const toggleSelectedYear = (yearKey: string) => {
    setSelectedYears(prev =>
      prev.includes(yearKey) ? prev.filter(item => item !== yearKey) : [...prev, yearKey]
    )
  }

  const toggleSelectedChapter = (chapter: string) => {
    setSelectedChapters(prev =>
      prev.includes(chapter) ? prev.filter(item => item !== chapter) : [...prev, chapter]
    )
  }

  const clearQuestionFilters = () => {
    setSelectedYears([])
    setSelectedChapters([])
  }

  const handleUnrestrictUser = async (userId: string) => {
    if (!isAdmin) return

    setUnrestrictingUserId(userId)
    setSuspendedError('')
    try {
      await api.admin.unrestrictUser(userId)
      await Promise.all([loadSuspendedUsers(), loadActivityUsers()])
      if (selectedSupportUserId === userId) {
        await loadSupportConversation(userId)
      }
    } catch (err: any) {
      setSuspendedError(err?.message || 'Failed to unrestrict user.')
    } finally {
      setUnrestrictingUserId(null)
    }
  }

  const handleSuspendUser = async (targetUser: AdminActivityUser) => {
    if (!isAdmin) return
    if (targetUser.role === 'admin') {
      setActivityError('Admin accounts cannot be blocked from this panel.')
      return
    }
    setSuspendTargetUser(targetUser)
    setSuspendReason('Policy violation')
    setSuspendMinutes('60')
    setActivityError('')
    setSuspendDialogOpen(true)
  }

  const handleConfirmSuspend = async () => {
    if (!isAdmin || !suspendTargetUser) return
    const targetUser = suspendTargetUser
    const minutes = Number.parseInt(suspendMinutes, 10)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setActivityError('Please enter a valid duration in minutes.')
      return
    }

    setMutatingUserId(targetUser.id)
    setActivityError('')
    setSuspendedError('')
    try {
      await api.admin.suspendUser(targetUser.id, {
        reason: suspendReason.trim() || 'Policy violation',
        minutes,
      })
      setSuspendDialogOpen(false)
      setSuspendTargetUser(null)
      await Promise.all([loadSuspendedUsers(), loadActivityUsers()])
      await loadSupportConversation(targetUser.id)
    } catch (err: any) {
      const message = err?.message || 'Failed to block user.'
      setActivityError(message)
      setSuspendedError(message)
    } finally {
      setMutatingUserId(null)
    }
  }

  const handleToggleMessaging = async (userId: string, messagingDisabled: boolean) => {
    if (!isAdmin) return
    setMutatingUserId(userId)
    setSuspendedError('')
    setSupportError('')
    try {
      await api.admin.setSuspensionMessaging(userId, messagingDisabled)
      await Promise.all([loadSuspendedUsers(), loadActivityUsers()])
      if (selectedSupportUserId === userId) {
        await loadSupportConversation(userId)
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to update messaging setting.'
      setSuspendedError(message)
      setSupportError(message)
    } finally {
      setMutatingUserId(null)
    }
  }

  const handleOpenSupport = async (userId: string) => {
    await loadSupportConversation(userId)
  }

  const handleSendAdminReply = async () => {
    if (!selectedSupportUserId || !adminReplyInput.trim() || sendingAdminReply) return
    setSendingAdminReply(true)
    setSupportError('')
    try {
      const data = await api.suspension.sendMessage(adminReplyInput.trim(), selectedSupportUserId)
      const reply = data?.message
      if (reply?.id) {
        setSelectedSupportConversation(prev => {
          if (!prev) return prev
          return {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: String(reply.id),
                userId: String(reply.userId || selectedSupportUserId),
                senderType: 'admin',
                senderName: typeof reply.senderName === 'string' ? reply.senderName : 'Admin',
                message: String(reply.message || adminReplyInput.trim()),
                createdAt: String(reply.createdAt || new Date().toISOString()),
              },
            ],
          }
        })
      } else {
        await loadSupportConversation(selectedSupportUserId)
      }
      setAdminReplyInput('')
    } catch (err: any) {
      setSupportError(err?.message || 'Failed to send admin reply.')
    } finally {
      setSendingAdminReply(false)
    }
  }

  const handleSendAdminChat = async () => {
    if (!isAdmin || adminChatSending) return
    const content = adminChatInput.trim()
    if (!content) return
    setAdminChatSending(true)
    setAdminChatError('')
    try {
      const data = await api.admin.sendChatMessage(content)
      const message = data?.message
      if (message?.id) {
        setAdminChatMessages(prev => [
          ...prev,
          {
            id: String(message.id),
            content: String(message.content || content),
            createdAt: String(message.createdAt || new Date().toISOString()),
            sender: {
              id: String(message?.sender?.id || user?.id || ''),
              name: String(message?.sender?.name || user?.name || 'Admin'),
              role: String(message?.sender?.role || 'admin'),
            },
          },
        ])
      } else {
        await loadAdminChat()
      }
      setAdminChatInput('')
    } catch (err: any) {
      setAdminChatError(err?.message || 'Failed to send admin chat message.')
    } finally {
      setAdminChatSending(false)
    }
  }

  const formatRemaining = (untilIso: string) => {
    const remainingMs = new Date(untilIso).getTime() - Date.now()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'less than a minute'
    const mins = Math.ceil(remainingMs / 60000)
    if (mins < 60) return `${mins} min`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  }

  const formatLastActivity = (iso: string | null) => {
    if (!iso) return 'No activity yet'
    const deltaMs = Date.now() - new Date(iso).getTime()
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return new Date(iso).toLocaleString()
    const mins = Math.floor(deltaMs / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleString()
  }

  const availableYears = useMemo(() => {
    const yearSet = new Set<string>()
    for (const item of questionLibrary) {
      const rawYear = typeof item?.pyqYear === 'number' ? item.pyqYear : null
      if (Number.isFinite(rawYear) && rawYear) {
        yearSet.add(String(rawYear))
      } else {
        yearSet.add(NO_YEAR_KEY)
      }
    }
    const years = Array.from(yearSet)
    years.sort((a, b) => {
      if (a === NO_YEAR_KEY) return 1
      if (b === NO_YEAR_KEY) return -1
      return Number(b) - Number(a)
    })
    return years
  }, [questionLibrary, NO_YEAR_KEY])

  const availableChapters = useMemo(() => {
    const chapterSet = new Set<string>()
    for (const item of questionLibrary) {
      if (typeof item?.chapter === 'string' && item.chapter.trim()) {
        chapterSet.add(item.chapter.trim())
      }
    }
    return Array.from(chapterSet).sort((a, b) => a.localeCompare(b))
  }, [questionLibrary])

  const filteredQuestions = useMemo(() => {
    let items = questionLibrary
    if (selectedYears.length > 0) {
      const allowed = new Set(selectedYears)
      items = items.filter(item => {
        const rawYear = typeof item?.pyqYear === 'number' ? item.pyqYear : null
        const key = Number.isFinite(rawYear) && rawYear ? String(rawYear) : NO_YEAR_KEY
        return allowed.has(key)
      })
    }
    if (selectedChapters.length > 0) {
      const allowed = new Set(selectedChapters)
      items = items.filter(item => allowed.has(String(item?.chapter || '').trim()))
    }
    return items
  }, [questionLibrary, selectedYears, selectedChapters, NO_YEAR_KEY])

  const examFolders = useMemo(() => {
    const bucket = new Map<string, { key: string; label: string; questions: any[] }>()
    for (const item of filteredQuestions) {
      const rawExam = typeof item?.pyqType === 'string' ? item.pyqType.trim() : ''
      const key = rawExam ? rawExam : UNASSIGNED_EXAM_KEY
      const label = rawExam ? rawExam : 'Unassigned'
      const existing = bucket.get(key)
      if (existing) {
        existing.questions.push(item)
      } else {
        bucket.set(key, { key, label, questions: [item] })
      }
    }
    const folders = Array.from(bucket.values())
    folders.sort((a, b) => {
      if (a.key === UNASSIGNED_EXAM_KEY) return 1
      if (b.key === UNASSIGNED_EXAM_KEY) return -1
      return a.label.localeCompare(b.label)
    })
    return folders
  }, [filteredQuestions, UNASSIGNED_EXAM_KEY])

  if (loading) return <LoadingSpinner />

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          label="Total Students"
          value={analytics?.totalStudents || 0}
          color="blue"
        />
        <StatCard
          icon={Target}
          label="Avg Performance"
          value={`${analytics?.averagePerformance || 0}%`}
          color="green"
        />
        <StatCard
          icon={Plus}
          label="Add Question"
          value="Click Here"
          color="purple"
          onClick={() => setShowQuestionForm(true)}
        />
      </div>

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-300" />
              AI Status
            </h3>
            <button
              type="button"
              onClick={loadAiStatus}
              disabled={aiStatusLoading}
              className="px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-700/40 hover:bg-slate-700/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${aiStatusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {aiStatusError && (
            <p className="mb-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {aiStatusError}
            </p>
          )}

          {aiStatusLoading ? (
            <p className="text-sm text-slate-400">Loading AI provider status...</p>
          ) : aiStatus?.providers?.length ? (
            <>
              <div className="mb-4 text-xs text-slate-400">
                Provider order: {aiStatus.providerOrder.join(' > ') || 'Not configured'}
              </div>
              <div className="mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  Max chat: {aiStatus.limits.chat}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  Max short: {aiStatus.limits.short}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  Max long: {aiStatus.limits.long}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  Max notes: {aiStatus.limits.notes}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  Max hint: {aiStatus.limits.hint}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
                  History: {aiStatus.limits.history}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {aiStatus.providers.map(provider => {
                  const statusColor =
                    provider.status === 'ok'
                      ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/30'
                      : provider.status === 'error'
                        ? 'text-red-200 bg-red-500/10 border-red-500/30'
                        : provider.status === 'disabled'
                          ? 'text-slate-300 bg-slate-700/30 border-slate-600'
                          : 'text-amber-200 bg-amber-500/10 border-amber-500/30'
                  return (
                    <div key={provider.provider} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium capitalize">{provider.provider}</p>
                        <span className={`text-xs px-2 py-1 rounded-full border ${statusColor}`}>
                          {provider.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Model: {provider.model}</p>
                      <p className="text-xs text-slate-400">Reasoning: {provider.reasoningModel}</p>
                      <p className="text-xs text-slate-400">
                        Last success: {provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleString() : 'N/A'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Last error: {provider.lastErrorAt ? new Date(provider.lastErrorAt).toLocaleString() : 'N/A'}
                      </p>
                      <p className="text-xs text-slate-400">
                        Limit: {provider.limitHint || (provider.configured ? 'Unknown' : 'Not configured')}
                      </p>
                      {provider.lastError && (
                        <p className="text-xs text-red-200 line-clamp-2">
                          {provider.lastError}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Note: Providers do not expose exact remaining credits via API. Status is inferred from last call.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No providers configured.</p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-blue-300" />
              Question Library
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadQuestionLibrary}
                disabled={questionLibraryLoading || deletingAllQuestions}
                className="px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-700/40 hover:bg-slate-700/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${questionLibraryLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDeleteAllQuestions}
                disabled={questionLibraryLoading || deletingAllQuestions}
                className="px-3 py-2 text-sm rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {deletingAllQuestions ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200">Filter by Year</p>
                <span className="text-xs text-slate-400">
                  {selectedYears.length ? `${selectedYears.length} selected` : 'All years'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 max-h-28 overflow-auto">
                {availableYears.length === 0 ? (
                  <span className="text-xs text-slate-500">No years available.</span>
                ) : (
                  availableYears.map(yearKey => {
                    const active = selectedYears.includes(yearKey)
                    return (
                      <button
                        key={yearKey}
                        type="button"
                        onClick={() => toggleSelectedYear(yearKey)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                          active
                            ? 'bg-blue-500/20 border-blue-400/50 text-blue-100'
                            : 'bg-slate-800/60 border-slate-600 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {yearKey === NO_YEAR_KEY ? 'No Year' : yearKey}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200">Filter by Chapter</p>
                <span className="text-xs text-slate-400">
                  {selectedChapters.length ? `${selectedChapters.length} selected` : 'All chapters'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 max-h-32 overflow-auto">
                {availableChapters.length === 0 ? (
                  <span className="text-xs text-slate-500">No chapters available.</span>
                ) : (
                  availableChapters.map(chapter => {
                    const active = selectedChapters.includes(chapter)
                    return (
                      <button
                        key={chapter}
                        type="button"
                        onClick={() => toggleSelectedChapter(chapter)}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                          active
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                            : 'bg-slate-800/60 border-slate-600 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {chapter}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {(selectedYears.length > 0 || selectedChapters.length > 0) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>
                Showing {filteredQuestions.length} of {questionLibrary.length} questions
              </span>
              <button
                type="button"
                onClick={clearQuestionFilters}
                className="px-3 py-1 rounded-full border border-slate-600 bg-slate-800/60 text-slate-200 hover:border-slate-500"
              >
                Clear Filters
              </button>
            </div>
          )}

          {questionLibraryError && (
            <p className="mb-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {questionLibraryError}
            </p>
          )}

          {questionLibraryLoading ? (
            <p className="text-sm text-slate-400">Loading questions...</p>
          ) : examFolders.length === 0 ? (
            <p className="text-sm text-slate-400">No questions available.</p>
          ) : (
            <div className="space-y-3">
              {examFolders.map(folder => {
                const isOpen = !!openQuestionFolders[folder.key]
                const isDeletingFolder = deletingFolderKey === folder.key
                return (
                  <div key={folder.key} className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleQuestionFolder(folder.key)}
                        className="flex items-center gap-2 text-left"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        <span className="font-medium">{folder.label}</span>
                        <span className="text-xs text-slate-400">
                          {folder.questions.length} questions
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteExamFolder(folder.key, folder.label)}
                        disabled={isDeletingFolder || deletingAllQuestions}
                        className="px-3 py-2 text-xs rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDeletingFolder ? 'Deleting...' : 'Delete Folder'}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="mt-3 space-y-2">
                        {folder.questions.map((q: any) => {
                          const deletingQuestion = deletingQuestionId === q.id
                          return (
                            <div
                              key={q.id}
                              className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-slate-400">
                                  {q.subject} • {q.chapter}
                                  {q.pyqYear ? ` • ${q.pyqYear}` : ''}
                                </p>
                                <div className="text-sm text-slate-200 line-clamp-2">
                                  <MathText text={q.question} />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleQuestion(q.id)}
                                disabled={deletingQuestion || deletingAllQuestions}
                                className="px-3 py-2 text-xs rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {deletingQuestion ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-300" />
              User Activity Monitor
            </h3>
            <button
              type="button"
              onClick={loadActivityUsers}
              disabled={activityLoading}
              className="px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-700/40 hover:bg-slate-700/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${activityLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {activityError && (
            <p className="mb-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {activityError}
            </p>
          )}

          {activityLoading ? (
            <p className="text-sm text-slate-400">Loading user activity...</p>
          ) : activityUsers.length === 0 ? (
            <p className="text-sm text-slate-400">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-left border-b border-slate-700">
                    <th className="py-2 pr-2 font-medium">User</th>
                    <th className="py-2 pr-2 font-medium">Last Activity</th>
                    <th className="py-2 pr-2 font-medium text-right">Questions</th>
                    <th className="py-2 pr-2 font-medium text-right">AI</th>
                    <th className="py-2 pr-2 font-medium text-right">Doubts</th>
                    <th className="py-2 pr-2 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activityUsers.map(activityUser => {
                    const busy =
                      unrestrictingUserId === activityUser.id ||
                      mutatingUserId === activityUser.id
                    const suspendActionsDisabled = busy || activityUser.role === 'admin'
                    return (
                      <tr
                        key={activityUser.id}
                        className="border-b border-slate-800/60 align-top"
                      >
                        <td className="py-2 pr-2">
                          <p className="font-medium">{activityUser.name}</p>
                          {activityUser.nickname && (
                            <p className="text-xs text-blue-300">@{activityUser.nickname}</p>
                          )}
                          <p className="text-xs text-slate-400">{activityUser.email}</p>
                          <p className="text-xs text-slate-500">
                            {activityUser.role}{activityUser.isGuest ? ' | guest' : ''}
                          </p>
                        </td>
                        <td className="py-2 pr-2 text-slate-300">
                          {formatLastActivity(activityUser.lastActivityAt)}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          {activityUser.questionsSolved}
                          <p className="text-xs text-slate-500">{activityUser.accuracy}%</p>
                        </td>
                        <td className="py-2 pr-2 text-right">{activityUser.aiInteractions}</td>
                        <td className="py-2 pr-2 text-right">
                          {activityUser.doubtsAsked}
                          <p className="text-xs text-slate-500">{activityUser.repliesGiven} replies</p>
                        </td>
                        <td className="py-2 pr-2">
                          {activityUser.isSuspended ? (
                            <div className="text-xs text-red-200">
                              <p>Blocked</p>
                              {activityUser.suspendedUntil && (
                                <p className="text-red-300/80">
                                  {formatRemaining(activityUser.suspendedUntil)} left
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-green-300">Active</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            {activityUser.isSuspended ? (
                              <button
                                type="button"
                                onClick={() => handleUnrestrictUser(activityUser.id)}
                                disabled={busy}
                                className="px-2 py-1 rounded-md text-xs bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50"
                              >
                                Unblock
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSuspendUser(activityUser)}
                                disabled={suspendActionsDisabled}
                                className="px-2 py-1 rounded-md text-xs bg-orange-500/20 hover:bg-orange-500/30 disabled:opacity-50"
                              >
                                Block
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleOpenSupport(activityUser.id)}
                              disabled={busy}
                              className="px-2 py-1 rounded-md text-xs bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-50"
                            >
                              Chat
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-300" />
              Blocked Users
            </h3>
            <button
              type="button"
              onClick={loadSuspendedUsers}
              disabled={suspendedLoading || !!unrestrictingUserId}
              className="px-3 py-2 text-sm rounded-lg border border-slate-600 bg-slate-700/40 hover:bg-slate-700/70 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${suspendedLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {suspendedError && (
            <p className="mb-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {suspendedError}
            </p>
          )}

          {suspendedLoading ? (
            <p className="text-sm text-slate-400">Loading blocked users...</p>
          ) : suspendedUsers.length === 0 ? (
            <p className="text-sm text-slate-400">No blocked users right now.</p>
          ) : (
            <div className="space-y-3">
              {suspendedUsers.map(blockedUser => (
                <div
                  key={blockedUser.id}
                  className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex flex-col gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{blockedUser.name}</p>
                    <p className="text-xs text-slate-300 truncate">{blockedUser.email}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Role: {blockedUser.role}{blockedUser.isGuest ? ' | guest' : ''}
                    </p>
                    <p className="text-xs text-red-200 mt-1">
                      Restricted until {new Date(blockedUser.suspendedUntil).toLocaleString()} ({formatRemaining(blockedUser.suspendedUntil)} left)
                    </p>
                    {blockedUser.suspensionReason && (
                      <p className="text-xs text-red-100 mt-1">Reason: {blockedUser.suspensionReason}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUnrestrictUser(blockedUser.id)}
                      disabled={unrestrictingUserId === blockedUser.id}
                      className="px-3 py-2 rounded-lg text-sm bg-red-500/20 hover:bg-red-500/30 text-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {unrestrictingUserId === blockedUser.id ? 'Unblocking...' : 'Unblock User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleMessaging(blockedUser.id, !blockedUser.suspensionMessagingDisabled)}
                      disabled={mutatingUserId === blockedUser.id}
                      className="px-3 py-2 rounded-lg text-sm bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {blockedUser.suspensionMessagingDisabled ? 'Enable Text' : 'Disable Text'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenSupport(blockedUser.id)}
                      disabled={mutatingUserId === blockedUser.id}
                      className="px-3 py-2 rounded-lg text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Open Chat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-300" />
              Blocked User Chat
            </h3>
            <div className="flex items-center gap-2">
              {selectedSupportConversation?.user && (
                <button
                  type="button"
                  onClick={() =>
                    handleToggleMessaging(
                      selectedSupportConversation.user.id,
                      !selectedSupportConversation.user.suspensionMessagingDisabled
                    )
                  }
                  disabled={mutatingUserId === selectedSupportConversation.user.id}
                  className="px-3 py-2 text-xs rounded-lg border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-50"
                >
                  {selectedSupportConversation.user.suspensionMessagingDisabled ? 'Enable User Text' : 'Disable User Text'}
                </button>
              )}
              {selectedSupportUserId && (
                <button
                  type="button"
                  onClick={() => void loadSupportConversation(selectedSupportUserId)}
                  disabled={supportLoading}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-700/60 hover:bg-slate-700/90 disabled:opacity-50"
                >
                  Refresh Chat
                </button>
              )}
            </div>
          </div>

          {supportError && (
            <p className="mt-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {supportError}
            </p>
          )}

          {!selectedSupportUserId ? (
            <p className="mt-3 text-sm text-slate-400">
              Select any user from "User Activity Monitor" or "Blocked Users" and open chat.
            </p>
          ) : supportLoading ? (
            <p className="mt-3 text-sm text-slate-400">Loading chat...</p>
          ) : (
            <>
              <div className="mt-3 text-sm text-slate-300">
                {selectedSupportConversation?.user ? (
                  <p>
                    Chat with <span className="font-medium">{selectedSupportConversation.user.name}</span>
                    {selectedSupportConversation.user.suspensionReason
                      ? ` | Reason: ${selectedSupportConversation.user.suspensionReason}`
                      : ''}
                  </p>
                ) : (
                  <p>Unable to load selected user details.</p>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 max-h-72 overflow-y-auto space-y-2">
                {selectedSupportConversation?.messages?.length ? (
                  selectedSupportConversation.messages.map(message => {
                    const isAdminMessage = message.senderType === 'admin'
                    const bubbleClass = isAdminMessage
                      ? 'ml-auto bg-blue-500/20 border-blue-500/30 text-blue-100'
                      : message.senderType === 'user'
                        ? 'mr-auto bg-green-500/15 border-green-500/30 text-green-100'
                        : 'mr-auto bg-slate-700/50 border-slate-600 text-slate-100'

                    return (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${bubbleClass}`}
                      >
                        <p className="text-[11px] opacity-80 mb-1">
                          {message.senderType === 'admin'
                            ? 'Admin'
                            : message.senderType === 'user'
                              ? (selectedSupportConversation.user.name || 'User')
                              : 'System'} | {new Date(message.createdAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap">{message.message}</p>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-slate-400">No chat messages yet.</p>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <textarea
                  value={adminReplyInput}
                  onChange={e => setAdminReplyInput(e.target.value)}
                  rows={2}
                  placeholder="Type admin reply..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  disabled={sendingAdminReply}
                />
                <button
                  type="button"
                  onClick={handleSendAdminReply}
                  disabled={!adminReplyInput.trim() || sendingAdminReply}
                  className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium self-end"
                >
                  {sendingAdminReply ? 'Sending...' : 'Send Reply'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-300" />
              Admin Chat
            </h3>
            <button
              type="button"
              onClick={loadAdminChat}
              disabled={adminChatLoading}
              className="px-3 py-2 text-xs rounded-lg border border-slate-600 bg-slate-700/60 hover:bg-slate-700/90 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {adminChatError && (
            <p className="mt-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {adminChatError}
            </p>
          )}

          {adminChatLoading ? (
            <p className="mt-3 text-sm text-slate-400">Loading admin chat...</p>
          ) : (
            <div
              ref={adminChatScrollRef}
              className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 max-h-72 overflow-y-auto space-y-2"
            >
              {adminChatMessages.length ? (
                adminChatMessages.map(message => {
                  const isSelf = message.sender.id && message.sender.id === user?.id
                  const bubbleClass = isSelf
                    ? 'ml-auto bg-blue-500/20 border-blue-500/30 text-blue-100'
                    : 'mr-auto bg-slate-800/70 border-slate-600 text-slate-100'

                  return (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${bubbleClass}`}
                    >
                      <p className="text-[11px] opacity-80 mb-1">
                        {message.sender.name || 'Admin'} | {new Date(message.createdAt).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-slate-400">No admin messages yet.</p>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <textarea
              value={adminChatInput}
              onChange={e => setAdminChatInput(e.target.value)}
              rows={2}
              placeholder="Type admin message..."
              className="flex-1 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button
              type="button"
              onClick={handleSendAdminChat}
              disabled={!adminChatInput.trim() || adminChatSending}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium self-end"
            >
              {adminChatSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Class Weak Areas */}
      {analytics?.classWeakAreas?.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4">Class Weak Areas</h3>
          <div className="flex flex-wrap gap-2">
            {analytics.classWeakAreas.map((area: string) => (
              <span
                key={area}
                className="px-3 py-2 bg-orange-500/20 text-orange-300 rounded-lg text-sm"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top Performers */}
      {analytics?.topPerformers?.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Top Performers
          </h3>
          <div className="space-y-3">
            {analytics.topPerformers.map((student: any, i: number) => (
              <div key={student.name} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-linear-to-br from-yellow-400 to-orange-400 flex items-center justify-center font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span>{student.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-medium">{student.accuracy}%</p>
                  <p className="text-sm text-slate-400">Rank: {student.rank}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {suspendDialogOpen && suspendTargetUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-2xl p-6 border border-slate-700 max-w-lg w-full"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Block User</h3>
              <button
                onClick={() => {
                  setSuspendDialogOpen(false)
                  setSuspendTargetUser(null)
                }}
                className="p-2 hover:bg-slate-700 rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 mb-4">
              Blocking <span className="font-medium">{suspendTargetUser.name}</span>
              {suspendTargetUser.email ? ` (${suspendTargetUser.email})` : ''}.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason</label>
                <textarea
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
                  placeholder="Policy violation"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={suspendMinutes}
                  onChange={e => setSuspendMinutes(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl focus:outline-none focus:border-blue-500"
                  placeholder="60"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuspendDialogOpen(false)
                  setSuspendTargetUser(null)
                }}
                className="flex-1 py-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                disabled={mutatingUserId === suspendTargetUser.id}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                {mutatingUserId === suspendTargetUser.id ? 'Blocking...' : 'Block User'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Question Modal */}
      {showQuestionForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-800 rounded-2xl p-6 border border-slate-700 max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Add New Question</h3>
              <button onClick={() => setShowQuestionForm(false)} className="p-2 hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <select
                  value={questionForm.subject}
                  onChange={e => setQuestionForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl"
                >
                  <option value="">Select Subject</option>
                  {Object.keys(SUBJECTS).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={questionForm.chapter}
                  onChange={e => setQuestionForm(prev => ({ ...prev, chapter: e.target.value }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl"
                  disabled={!questionForm.subject}
                >
                  <option value="">Select Chapter</option>
                  {questionForm.subject && SUBJECTS[questionForm.subject as keyof typeof SUBJECTS].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <select
                value={questionForm.difficulty}
                onChange={e => setQuestionForm(prev => ({ ...prev, difficulty: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>

              <textarea
                value={questionForm.question}
                onChange={e => setQuestionForm(prev => ({ ...prev, question: e.target.value }))}
                placeholder="Enter question (LaTeX supported)"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl min-h-25"
              />

              {questionForm.options.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={e => {
                    const newOpts = [...questionForm.options]
                    newOpts[i] = e.target.value
                    setQuestionForm(prev => ({ ...prev, options: newOpts }))
                  }}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl"
                />
              ))}

              <select
                value={questionForm.correctAnswer}
                onChange={e => setQuestionForm(prev => ({ ...prev, correctAnswer: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl"
              >
                {questionForm.options.map((_, i) => (
                  <option key={i} value={i.toString()}>
                    Correct: Option {String.fromCharCode(65 + i)}
                  </option>
                ))}
              </select>

              <button
                onClick={handleAddQuestion}
                disabled={!questionForm.subject || !questionForm.question}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Add Question
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

// Helper Components
function StatCard({ icon: Icon, label, value, color, onClick }: {
  icon: any
  label: string
  value: string | number
  color: string
  onClick?: () => void
}) {
  const colors = {
    blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-400',
    green: 'from-green-500/20 to-green-600/20 border-green-500/30 text-green-400',
    purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 text-purple-400',
    orange: 'from-orange-500/20 to-orange-600/20 border-orange-500/30 text-orange-400'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className={`bg-linear-to-br ${colors[color as keyof typeof colors]} rounded-2xl p-6 border cursor-pointer`}
    >
      <Icon className="w-8 h-8 mb-3" />
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </motion.div>
  )
}

function QuickActionCard({ icon: Icon, title, description, color }: {
  icon: any
  title: string
  description: string
  color: string
}) {
  const colors = {
    blue: 'hover:border-blue-500/50',
    purple: 'hover:border-purple-500/50',
    green: 'hover:border-green-500/50'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className={`bg-slate-800/50 rounded-2xl p-6 border border-slate-700 ${colors[color as keyof typeof colors]} transition-colors cursor-pointer`}
    >
      <Icon className="w-8 h-8 mb-3 text-slate-400" />
      <h4 className="font-semibold">{title}</h4>
      <p className="text-sm text-slate-400 mt-1">{description}</p>
    </motion.div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
      />
    </div>
  )
}

function parseQuestionOptions(options: string | null | undefined): string[] {
  if (!options) return []
  try {
    const parsed = JSON.parse(options)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => (typeof item === 'string' ? item : String(item ?? '')))
  } catch {
    return []
  }
}


