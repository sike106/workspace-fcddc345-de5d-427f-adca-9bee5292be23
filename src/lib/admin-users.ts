import { db } from './db'

export interface AdminUserActivitySnapshot {
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

function toDateMs(date: Date | null | undefined): number {
  if (!date) return 0
  const ms = date.getTime()
  return Number.isFinite(ms) ? ms : 0
}

function buildFallbackRows(
  users: Array<{
    id: string
    name: string
    nickname: string | null
    email: string
    role: string
    isGuest: boolean
    createdAt: Date
    suspendedUntil: Date | null
    suspensionReason: string | null
    suspensionMessagingDisabled: boolean
  }>
): AdminUserActivitySnapshot[] {
  const nowMs = Date.now()

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    nickname: user.nickname || null,
    email: user.email,
    role: user.role,
    isGuest: user.isGuest,
    createdAt: user.createdAt.toISOString(),
    isSuspended: !!user.suspendedUntil && user.suspendedUntil.getTime() > nowMs,
    suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
    suspensionReason: user.suspensionReason || null,
    suspensionMessagingDisabled: user.suspensionMessagingDisabled,
    questionsSolved: 0,
    accuracy: 0,
    aiInteractions: 0,
    mockAttempts: 0,
    doubtsAsked: 0,
    repliesGiven: 0,
    appealMessages: 0,
    lastActivityAt: user.createdAt.toISOString(),
  }))
}

export async function getAdminUserActivity(limit = 200): Promise<AdminUserActivitySnapshot[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500)

  const maxAttempts = 3
  let users: Array<{
    id: string
    name: string
    nickname: string | null
    email: string
    role: string
    isGuest: boolean
    createdAt: Date
    suspendedUntil: Date | null
    suspensionReason: string | null
    suspensionMessagingDisabled: boolean
  }> = []

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      users = await db.user.findMany({
        where: {
          role: { not: 'admin' },
        },
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          role: true,
          isGuest: true,
          createdAt: true,
          suspendedUntil: true,
          suspensionReason: true,
          suspensionMessagingDisabled: true,
        },
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
      })
      break
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message.toLowerCase() : ''
      if (message.includes('database is locked') && attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
        continue
      }
      throw err
    }
  }

  if (users.length === 0) {
    return []
  }

  const userIds = users.map(user => user.id)

  try {
    const [progressGroups, aiGroups, mockGroups, doubtGroups, replyGroups, appealGroups] =
      await Promise.all([
        db.progress.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _sum: {
            questionsSolved: true,
            correctAnswers: true,
          },
          _max: {
            lastPracticed: true,
          },
        }),
        db.aIHistory.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _count: {
            _all: true,
          },
          _max: {
            createdAt: true,
          },
        }),
        db.mockResult.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _count: {
            _all: true,
          },
          _max: {
            submittedAt: true,
          },
        }),
        db.doubt.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
            isDeleted: false,
          },
          _count: {
            _all: true,
          },
          _max: {
            updatedAt: true,
          },
        }),
        db.doubtReply.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
          },
          _count: {
            _all: true,
          },
          _max: {
            createdAt: true,
          },
        }),
        db.suspensionMessage.groupBy({
          by: ['userId'],
          where: {
            userId: { in: userIds },
          },
          _count: {
            _all: true,
          },
          _max: {
            createdAt: true,
          },
        }),
      ])

    const progressMap = new Map(progressGroups.map(item => [item.userId, item]))
    const aiMap = new Map(aiGroups.map(item => [item.userId, item]))
    const mockMap = new Map(mockGroups.map(item => [item.userId, item]))
    const doubtMap = new Map(doubtGroups.map(item => [item.userId, item]))
    const replyMap = new Map(replyGroups.map(item => [item.userId, item]))
    const appealMap = new Map(appealGroups.map(item => [item.userId, item]))

    const nowMs = Date.now()
    const rows: AdminUserActivitySnapshot[] = users.map((user) => {
      const progress = progressMap.get(user.id)
      const ai = aiMap.get(user.id)
      const mocks = mockMap.get(user.id)
      const doubts = doubtMap.get(user.id)
      const replies = replyMap.get(user.id)
      const appeals = appealMap.get(user.id)

      const questionsSolved = progress?._sum.questionsSolved || 0
      const correctAnswers = progress?._sum.correctAnswers || 0
      const accuracy = questionsSolved > 0
        ? Math.round(((correctAnswers / questionsSolved) * 100) * 10) / 10
        : 0

      const lastActivityMs = Math.max(
        toDateMs(progress?._max.lastPracticed || null),
        toDateMs(ai?._max.createdAt || null),
        toDateMs(mocks?._max.submittedAt || null),
        toDateMs(doubts?._max.updatedAt || null),
        toDateMs(replies?._max.createdAt || null),
        toDateMs(appeals?._max.createdAt || null),
        toDateMs(user.createdAt),
      )

      const isSuspended =
        !!user.suspendedUntil && user.suspendedUntil.getTime() > nowMs

      return {
        id: user.id,
        name: user.name,
        nickname: user.nickname || null,
        email: user.email,
        role: user.role,
        isGuest: user.isGuest,
        createdAt: user.createdAt.toISOString(),
        isSuspended,
        suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
        suspensionReason: user.suspensionReason || null,
        suspensionMessagingDisabled: user.suspensionMessagingDisabled,
        questionsSolved,
        accuracy,
        aiInteractions: ai?._count._all || 0,
        mockAttempts: mocks?._count._all || 0,
        doubtsAsked: doubts?._count._all || 0,
        repliesGiven: replies?._count._all || 0,
        appealMessages: appeals?._count._all || 0,
        lastActivityAt: lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null,
      }
    })

    rows.sort((a, b) => {
      const bMs = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0
      const aMs = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0
      return bMs - aMs
    })

    return rows.length > 0 ? rows : buildFallbackRows(users)
  } catch (error) {
    console.error('Admin user activity aggregation error:', error)
    return buildFallbackRows(users)
  }
}
