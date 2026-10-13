'use client'

import { useEffect, useRef } from 'react'

type AdBannerProps = {
  slot: string
  format?: string
  className?: string
  style?: React.CSSProperties
}

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

export default function AdBanner({
  slot,
  format = 'auto',
  className = '',
  style,
}: AdBannerProps) {
  const pushedRef = useRef(false)

  useEffect(() => {
    if (pushedRef.current) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushedRef.current = true
    } catch (e) {
      // Ad block ya script load nahi hua
    }
  }, [])

  return (
    <div className={`ad-banner-container ${className}`} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-format={format}
        data-ad-client="ca-pub-6942703237637346"
        data-ad-slot={slot}
      />
    </div>
  )
}
