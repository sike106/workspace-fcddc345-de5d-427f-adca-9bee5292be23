'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MathText } from '@/components/math-text'
import { CheckCircle, XCircle } from 'lucide-react'

type SolveQuestion = {
  id: string
  subject: string
  chapter: string
  difficulty: string
  question: string
  options: string | null
  correctAnswer: string | number
  pyqYear?: number
  pyqType?: string
  solution?: string | null
  explanation?: string | null
  alternateApproach?: string | null
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

const NO_YEAR_KEY = '__no_year__'

function parseCsv(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function PyqSolveContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const searchKey = searchParams.toString()
  const [questions, setQuestions] = useState<SolveQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [storageKey, setStorageKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadQuestions = async () => {
      setError('')
      setLoading(false)
      setQuestions([])
      setIndex(0)
      setSelectedAnswer(null)
      setChecked(false)

      if (token) {
        if (typeof window === 'undefined') return
        const key = `pyq_solve_${token}`
        setStorageKey(key)
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          setError('Selected PYQs not found. Please reopen from the main PYQ page.')
          return
        }
        try {
          const parsed = JSON.parse(raw)
          if (!parsed || !Array.isArray(parsed.questions)) {
            throw new Error('Invalid payload')
          }
          if (active) {
            setQuestions(parsed.questions)
          }
        } catch {
          setError('Failed to load selected PYQs.')
        }
        return
      }

      setStorageKey(null)

      const exam = (searchParams.get('exam') || '').trim()
      if (!exam) {
        setError('Select an exam and load PYQs first.')
        return
      }
      const subject = (searchParams.get('subject') || '').trim()
      const chapter = (searchParams.get('chapter') || '').trim()
      const yearParam = (searchParams.get('year') || '').trim()
      const difficulty = (searchParams.get('difficulty') || '').trim()
      const filterYears = parseCsv(searchParams.get('years'))
      const filterChapters = parseCsv(searchParams.get('chapters'))

      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('exam', exam)
        if (subject) params.set('subject', subject)
        if (difficulty) params.set('difficulty', difficulty)
        if (chapter && filterChapters.length === 0) params.set('chapter', chapter)
        if (yearParam && filterYears.length === 0) params.set('year', yearParam)

        const res = await fetch(`/api/pyq/questions?${params.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data?.error || 'Unable to load PYQs.')
          return
        }
        let items = Array.isArray(data?.questions) ? data.questions : []
        if (filterYears.length > 0) {
          const allowed = new Set(filterYears)
          items = items.filter((item: any) => {
            const rawYear = typeof item?.pyqYear === 'number' ? item.pyqYear : null
            const key = Number.isFinite(rawYear) && rawYear ? String(rawYear) : NO_YEAR_KEY
            return allowed.has(key)
          })
        }
        if (filterChapters.length > 0) {
          const allowed = new Set(filterChapters.map(ch => ch.trim()).filter(Boolean))
          items = items.filter((item: any) => allowed.has(String(item?.chapter || '').trim()))
        }
        if (active) {
          setQuestions(items)
        }
      } catch {
        if (active) {
          setError('Unable to load PYQs.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [token, searchKey])

  useEffect(() => {
    return () => {
      if (storageKey) {
        window.localStorage.removeItem(storageKey)
      }
    }
  }, [storageKey])

  const question = questions[index]
  const options = useMemo(() => parseQuestionOptions(question?.options), [question?.options])
  const correctIndex = Number.parseInt(String(question?.correctAnswer ?? ''), 10)
  const correctOption = Number.isFinite(correctIndex) ? options[correctIndex] : undefined
  const isCorrect = checked && selectedAnswer !== null && String(selectedAnswer) === String(question?.correctAnswer ?? '')

  const handleCheck = () => {
    if (!question || selectedAnswer === null) return
    setChecked(true)
  }

  const handleNext = () => {
    if (index < questions.length - 1) {
      setIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setChecked(false)
    }
  }

  const handlePrev = () => {
    if (index > 0) {
      setIndex(prev => prev - 1)
      setSelectedAnswer(null)
      setChecked(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-end">
          <button
            onClick={() => window.history.back()}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Back
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="bg-slate-900/60 rounded-2xl p-8 border border-slate-700 text-center text-slate-400">
            Loading PYQs...
          </div>
        )}

        {!loading && !error && questions.length === 0 && (
          <div className="bg-slate-900/60 rounded-2xl p-8 border border-slate-700 text-center text-slate-400">
            Is selection me question nahi hai.
          </div>
        )}

        {!loading && !error && question && (
          <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-700">
            <div className="text-lg mb-4">
              <MathText text={question.question} />
            </div>

            {options.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {options.map((opt, i) => {
                  const isSelected = selectedAnswer === i
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedAnswer(i)}
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

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={handlePrev}
                disabled={index === 0}
                className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Previous
              </button>
              <button
                onClick={handleCheck}
                disabled={selectedAnswer === null}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Check Answer
              </button>
              <button
                onClick={handleNext}
                disabled={index >= questions.length - 1}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl font-medium transition-colors"
              >
                Next Question
              </button>
            </div>

            {checked && (
              <div className={`mt-6 p-4 rounded-xl border ${
                isCorrect ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {isCorrect ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`font-medium ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                    {isCorrect ? 'Correct!' : 'Incorrect'}
                  </span>
                </div>
                <div className="text-sm mb-2 text-slate-200">
                  Correct Answer:{' '}
                  {Number.isFinite(correctIndex) ? String.fromCharCode(65 + correctIndex) : ''}
                  {correctOption ? `: ` : ''}
                  {correctOption && <MathText as="span" text={correctOption} />}
                </div>
                {question.solution && (
                  <div className="mt-3 text-slate-300">
                    <p className="text-sm font-medium mb-1">Uploaded Solution:</p>
                    <MathText text={question.solution} />
                  </div>
                )}
                {question.explanation && (
                  <div className="mt-3 text-slate-300">
                    <p className="text-sm font-medium mb-1">Explanation:</p>
                    <MathText text={question.explanation} />
                  </div>
                )}

                {isCorrect && (
                  <div className="mt-3 text-slate-300">
                    <p className="text-sm font-medium mb-1">Alternate Approach (AI):</p>
                    {question.alternateApproach ? (
                      <MathText text={question.alternateApproach} />
                    ) : (
                      <div className="text-sm text-slate-400">No alternate approach uploaded for this question.</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PyqSolvePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-slate-900/60 rounded-2xl p-8 border border-slate-700 text-center text-slate-400">
              Loading PYQs...
            </div>
          </div>
        </div>
      }
    >
      <PyqSolveContent />
    </Suspense>
  )
}
