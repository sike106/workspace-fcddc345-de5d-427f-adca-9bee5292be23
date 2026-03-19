'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { formatLatex } from '@/lib/latex'

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>
      typesetClear?: (elements?: Element[]) => void
    }
  }
}

type MathTextProps = {
  text: string
  className?: string
  as?: 'div' | 'span'
}

const hasMathMarkers = (value: string): boolean => {
  return (
    value.includes('\\(') ||
    value.includes('\\)') ||
    value.includes('\\[') ||
    value.includes('\\]') ||
    value.includes('$$') ||
    value.includes('$')
  )
}

function MathTextInner({ text, className, as = 'div' }: MathTextProps) {
  const ref = useRef<HTMLElement | null>(null)
  const html = useMemo(() => formatLatex(text), [text])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof window === 'undefined') return

    let cancelled = false
    let attempts = 0
    const retryTimers: Array<ReturnType<typeof setTimeout>> = []

    const shouldTypeset = () => {
      if (element.querySelector('mjx-container')) return false
      const rawText = element.textContent || ''
      return hasMathMarkers(rawText)
    }

    const runTypeset = async () => {
      if (cancelled) return
      attempts += 1
      const mathJax = window.MathJax
      if (!mathJax?.typesetPromise) {
        if (attempts < 60) {
          retryTimers.push(setTimeout(() => void runTypeset(), 120))
        }
        return
      }

      if (!shouldTypeset()) return

      try {
        mathJax.typesetClear?.([element])
        await mathJax.typesetPromise([element])
      } catch {
        if (attempts < 60) {
          retryTimers.push(setTimeout(() => void runTypeset(), 180))
        }
      }
    }

    const observer = new MutationObserver(() => {
      if (cancelled) return
      if (shouldTypeset()) {
        retryTimers.forEach(timer => clearTimeout(timer))
        retryTimers.length = 0
        retryTimers.push(setTimeout(() => void runTypeset(), 30))
      }
    })

    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    })

    // Initial render + delayed checks to survive streaming/hydration.
    void runTypeset()
    retryTimers.push(setTimeout(() => void runTypeset(), 220))
    retryTimers.push(setTimeout(() => void runTypeset(), 900))
    retryTimers.push(setTimeout(() => void runTypeset(), 1800))
    retryTimers.push(setTimeout(() => void runTypeset(), 3500))
    retryTimers.push(setTimeout(() => void runTypeset(), 5000))

    const startup = window.MathJax?.startup as { promise?: Promise<void> } | undefined
    startup?.promise?.then(() => void runTypeset())

    return () => {
      cancelled = true
      observer.disconnect()
      retryTimers.forEach(timer => clearTimeout(timer))
    }
  }, [html])

  const Tag = as

  return (
    <Tag
      ref={ref as any}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export const MathText = memo(
  MathTextInner,
  (prev, next) =>
    prev.text === next.text &&
    prev.className === next.className &&
    prev.as === next.as
)
