import { db } from './db'

interface RankPrediction {
  rankRange: { min: number; max: number }
  percentile: number
  confidence: string
  recommendations: string[]
}

interface SubjectAnalytics {
  subject: string
  accuracy: number
  questionsSolved: number
  totalTime: number
  avgTimePerQuestion: number
  weakChapters: string[]
  strongChapters: string[]
  progress: number
}

interface UserAnalytics {
  overallAccuracy: number
  totalQuestions: number
  totalTests: number
  subjectAnalytics: SubjectAnalytics[]
  weakAreas: string[]
  rankPrediction: RankPrediction
  recentActivity: any[]
  aiDependency: number
}

// Calculate rank prediction based on mock test performance
export async function calculateRankPrediction(userId: string): Promise<RankPrediction> {
  const mockResults = await db.mockResult.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: 10
  })
  
  if (mockResults.length === 0) {
    return {
      rankRange: { min: 0, max: 0 },
      percentile: 0,
      confidence: 'Insufficient data',
      recommendations: ['Take mock tests to get rank prediction']
    }
  }
  
  // Calculate average score percentage
  const avgScorePercentage = mockResults.reduce((sum, result) => {
    return sum + (result.score / 300) * 100
  }, 0) / mockResults.length
  
  // Calculate attempt rate
  const avgAttemptRate = mockResults.reduce((sum, result) => {
    const total = result.correct + result.incorrect + result.unattempted
    return sum + ((result.correct + result.incorrect) / total) * 100
  }, 0) / mockResults.length
  
  // Calculate accuracy
  const avgAccuracy = mockResults.reduce((sum, result) => {
    const attempted = result.correct + result.incorrect
    return sum + (attempted > 0 ? (result.correct / attempted) * 100 : 0)
  }, 0) / mockResults.length
  
  // Time management score
  const avgTimeScore = mockResults.reduce((sum, result) => {
    // Assuming 3 hours = 180 minutes = optimal time
    const optimalTime = 180
    const efficiency = Math.min(100, (optimalTime * 60 / result.timeTaken) * 100)
    return sum + efficiency
  }, 0) / mockResults.length
  
  // Composite score (weighted)
  const compositeScore = (
    avgScorePercentage * 0.5 +
    avgAccuracy * 0.25 +
    avgAttemptRate * 0.15 +
    avgTimeScore * 0.1
  )
  
  // Rank estimation based on JEE Main patterns
  // These are approximate mappings based on historical data
  let rankMin: number, rankMax: number, percentile: number
  
  if (compositeScore >= 90) {
    percentile = 99 + (compositeScore - 90) * 0.1
    rankMin = Math.max(1, Math.floor((100 - percentile) * 100))
    rankMax = Math.floor(rankMin * 1.5)
  } else if (compositeScore >= 80) {
    percentile = 97 + (compositeScore - 80) * 0.2
    rankMin = Math.floor((100 - percentile) * 100)
    rankMax = Math.floor(rankMin * 1.5)
  } else if (compositeScore >= 70) {
    percentile = 90 + (compositeScore - 70) * 0.7
    rankMin = Math.floor((100 - percentile) * 120)
    rankMax = Math.floor(rankMin * 1.5)
  } else if (compositeScore >= 60) {
    percentile = 80 + (compositeScore - 60) * 1.0
    rankMin = Math.floor((100 - percentile) * 150)
    rankMax = Math.floor(rankMin * 1.5)
  } else if (compositeScore >= 50) {
    percentile = 70 + (compositeScore - 50) * 1.0
    rankMin = Math.floor((100 - percentile) * 200)
    rankMax = Math.floor(rankMin * 1.5)
  } else if (compositeScore >= 40) {
    percentile = 50 + (compositeScore - 40) * 2.0
    rankMin = Math.floor((100 - percentile) * 300)
    rankMax = Math.floor(rankMin * 1.5)
  } else {
    percentile = compositeScore * 1.25
    rankMin = Math.floor((100 - Math.max(percentile, 10)) * 500)
    rankMax = Math.floor(rankMin * 1.5)
  }
  
  // Generate recommendations
  const recommendations: string[] = []
  
  if (avgAccuracy < 70) {
    recommendations.push('Focus on accuracy over attempt rate')
  }
  if (avgAttemptRate < 70) {
    recommendations.push('Improve speed to attempt more questions')
  }
  if (avgTimeScore < 80) {
    recommendations.push('Practice time management in mock tests')
  }
  if (avgScorePercentage < 60) {
    recommendations.push('Strengthen fundamental concepts before advanced topics')
  }
  
  return {
    rankRange: { min: Math.max(1, rankMin), max: rankMax },
    percentile: Math.min(99.99, Math.max(0, percentile)),
    confidence: mockResults.length >= 5 ? 'High' : mockResults.length >= 3 ? 'Medium' : 'Low',
    recommendations
  }
}

// Get comprehensive user analytics
export async function getUserAnalytics(userId: string): Promise<UserAnalytics> {
  // Get progress data
  const progressData = await db.progress.findMany({
    where: { userId }
  })
  
  // Get mock results
  const mockResults = await db.mockResult.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: 20
  })
  
  // Get AI history for dependency analysis
  const aiHistory = await db.aIHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100
  })
  
  // Calculate subject analytics
  const subjects = ['Physics', 'Chemistry', 'Mathematics']
  const subjectAnalytics: SubjectAnalytics[] = subjects.map(subject => {
    const subjectProgress = progressData.filter(p => p.subject === subject)
    
    const questionsSolved = subjectProgress.reduce((sum, p) => sum + p.questionsSolved, 0)
    const correctAnswers = subjectProgress.reduce((sum, p) => sum + p.correctAnswers, 0)
    const totalTime = subjectProgress.reduce((sum, p) => sum + p.totalTime, 0)
    const accuracy = questionsSolved > 0 ? (correctAnswers / questionsSolved) * 100 : 0
    
    // Identify weak and strong chapters
    const chapterPerformance = subjectProgress.map(p => ({
      chapter: p.chapter,
      accuracy: p.questionsSolved > 0 ? (p.correctAnswers / p.questionsSolved) * 100 : 0
    }))
    
    const weakChapters = chapterPerformance
      .filter(c => c.accuracy < 50 && c.accuracy > 0)
      .map(c => c.chapter)
    
    const strongChapters = chapterPerformance
      .filter(c => c.accuracy >= 70)
      .map(c => c.chapter)
    
    // Calculate progress (based on expected chapters per subject)
    const expectedChapters = 20 // Approximate chapters per subject
    const practicedChapters = subjectProgress.filter(p => p.questionsSolved > 0).length
    const progress = (practicedChapters / expectedChapters) * 100
    
    return {
      subject,
      accuracy: Math.round(accuracy * 10) / 10,
      questionsSolved,
      totalTime,
      avgTimePerQuestion: questionsSolved > 0 ? Math.round(totalTime / questionsSolved) : 0,
      weakChapters,
      strongChapters,
      progress: Math.min(100, Math.round(progress))
    }
  })
  
  // Calculate overall metrics
  const totalQuestions = progressData.reduce((sum, p) => sum + p.questionsSolved, 0)
  const totalCorrect = progressData.reduce((sum, p) => sum + p.correctAnswers, 0)
  const overallAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0
  
  // Identify weak areas
  const weakAreas: string[] = []
  for (const subject of subjectAnalytics) {
    for (const chapter of subject.weakChapters) {
      weakAreas.push(`${subject.subject}: ${chapter}`)
    }
  }
  
  // Calculate AI dependency (questions asked per practice session)
  const aiDependency = totalQuestions > 0 ? (aiHistory.length / totalQuestions) * 100 : 0
  
  // Get rank prediction
  const rankPrediction = await calculateRankPrediction(userId)
  
  // Get recent activity
  const recentActivity = await getRecentActivity(userId)
  
  return {
    overallAccuracy: Math.round(overallAccuracy * 10) / 10,
    totalQuestions,
    totalTests: mockResults.length,
    subjectAnalytics,
    weakAreas,
    rankPrediction,
    recentActivity,
    aiDependency: Math.round(aiDependency * 10) / 10
  }
}

// Get recent activity
async function getRecentActivity(userId: string): Promise<any[]> {
  const activities: any[] = []
  
  // Get recent progress
  const recentProgress = await db.progress.findMany({
    where: { userId, lastPracticed: { not: null } },
    orderBy: { lastPracticed: 'desc' },
    take: 5
  })
  
  for (const progress of recentProgress) {
    activities.push({
      type: 'practice',
      subject: progress.subject,
      chapter: progress.chapter,
      questionsSolved: progress.questionsSolved,
      timestamp: progress.lastPracticed
    })
  }
  
  // Get recent mock results
  const recentMocks = await db.mockResult.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: 3,
    include: { test: { select: { title: true } } }
  })
  
  for (const result of recentMocks) {
    activities.push({
      type: 'mock',
      testName: result.test.title,
      score: result.score,
      timestamp: result.submittedAt
    })
  }
  
  // Get recent AI interactions
  const recentAI = await db.aIHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      subject: true,
      chapter: true,
      createdAt: true
    }
  })
  
  for (const ai of recentAI) {
    activities.push({
      type: 'ai_chat',
      subject: ai.subject,
      chapter: ai.chapter,
      timestamp: ai.createdAt
    })
  }
  
  // Sort by timestamp
  activities.sort((a, b) => {
    const timeA = a.timestamp?.getTime() || 0
    const timeB = b.timestamp?.getTime() || 0
    return timeB - timeA
  })
  
  return activities.slice(0, 10)
}

// Get teacher's class analytics
export async function getTeacherAnalytics(teacherId: string): Promise<{
  totalStudents: number
  averagePerformance: number
  topPerformers: any[]
  strugglingStudents: any[]
  classWeakAreas: string[]
}> {
  // Get all students (in a real system, this would be filtered by teacher's classes)
  const students = await db.user.findMany({
    where: {
      role: 'student',
      isGuest: false,
    },
    select: { id: true, name: true }
  })
  
  const studentAnalytics = await Promise.all(
    students.map(async (student) => {
      const analytics = await getUserAnalytics(student.id)
      return {
        ...student,
        analytics
      }
    })
  )
  
  const averagePerformance = studentAnalytics.reduce((sum, s) => sum + s.analytics.overallAccuracy, 0) / students.length
  
  const sorted = [...studentAnalytics].sort((a, b) => b.analytics.overallAccuracy - a.analytics.overallAccuracy)
  
  const topPerformers = sorted.slice(0, 5).map(s => ({
    name: s.name,
    accuracy: s.analytics.overallAccuracy,
    rank: s.analytics.rankPrediction.rankRange.min
  }))
  
  const strugglingStudents = sorted.slice(-5).reverse().map(s => ({
    name: s.name,
    accuracy: s.analytics.overallAccuracy,
    weakAreas: s.analytics.weakAreas.slice(0, 3)
  }))
  
  // Aggregate class weak areas
  const classWeakAreas: string[] = []
  const areaCount: Record<string, number> = {}
  
  for (const student of studentAnalytics) {
    for (const area of student.analytics.weakAreas) {
      areaCount[area] = (areaCount[area] || 0) + 1
    }
  }
  
  const sortedAreas = Object.entries(areaCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([area]) => area)
  
  return {
    totalStudents: students.length,
    averagePerformance: Math.round(averagePerformance * 10) / 10,
    topPerformers,
    strugglingStudents,
    classWeakAreas: sortedAreas
  }
}

export async function getLeaderboard(userId: string, limit = 10): Promise<{
  leaders: Array<{
    id: string
    name: string
    rank: number
    accuracy: number
    questionsSolved: number
    totalTests: number
    isYou: boolean
  }>
  userRank: {
    id: string
    name: string
    rank: number
    accuracy: number
    questionsSolved: number
    totalTests: number
  } | null
}> {
  const safeLimit = Math.min(Math.max(limit, 1), 25)

  const students = await db.user.findMany({
    where: { role: 'student' },
    select: { id: true, name: true }
  })

  if (students.length === 0) {
    return { leaders: [], userRank: null }
  }

  const progressRows = await db.progress.findMany({
    where: { userId: { in: students.map(s => s.id) } },
    select: { userId: true, questionsSolved: true, correctAnswers: true }
  })

  const mockResults = await db.mockResult.findMany({
    where: { userId: { in: students.map(s => s.id) } },
    select: { userId: true }
  })

  const progressMap: Record<string, { questionsSolved: number; correctAnswers: number }> = {}
  for (const row of progressRows) {
    const entry = progressMap[row.userId] || { questionsSolved: 0, correctAnswers: 0 }
    entry.questionsSolved += row.questionsSolved
    entry.correctAnswers += row.correctAnswers
    progressMap[row.userId] = entry
  }

  const testMap: Record<string, number> = {}
  for (const result of mockResults) {
    testMap[result.userId] = (testMap[result.userId] || 0) + 1
  }

  const ranked = students.map(student => {
    const progress = progressMap[student.id] || { questionsSolved: 0, correctAnswers: 0 }
    const accuracy = progress.questionsSolved > 0
      ? (progress.correctAnswers / progress.questionsSolved) * 100
      : 0

    return {
      id: student.id,
      name: student.name,
      accuracy: Math.round(accuracy * 10) / 10,
      questionsSolved: progress.questionsSolved,
      totalTests: testMap[student.id] || 0
    }
  }).sort((a, b) => {
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy
    if (b.questionsSolved !== a.questionsSolved) return b.questionsSolved - a.questionsSolved
    return a.name.localeCompare(b.name)
  }).map((entry, index) => ({
    ...entry,
    rank: index + 1
  }))

  const leaders = ranked.slice(0, safeLimit).map(entry => ({
    ...entry,
    isYou: entry.id === userId
  }))

  const userRank = ranked.find(entry => entry.id === userId) || null

  return { leaders, userRank }
}
