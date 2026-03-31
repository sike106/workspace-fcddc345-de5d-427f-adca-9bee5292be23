'use client'

import { useEffect } from 'react'

type ScriptSpec = {
  id: string
  src?: string
  async?: boolean
  attrs?: Record<string, string>
  inline?: string
  target?: 'head' | 'body'
}

function injectScript(spec: ScriptSpec) {
  const existing = document.querySelector(`script[data-ad-runtime="true"][data-ad-id="${spec.id}"]`)
  if (existing) return
  const script = document.createElement('script')
  script.setAttribute('data-ad-runtime', 'true')
  script.setAttribute('data-ad-id', spec.id)
  if (spec.async) script.async = true
  if (spec.src) script.src = spec.src
  if (spec.inline) script.text = spec.inline
  if (spec.attrs) {
    Object.entries(spec.attrs).forEach(([key, value]) => {
      script.setAttribute(key, value)
    })
  }
  const target = spec.target === 'body' ? document.body : document.head
  target?.appendChild(script)
}

export default function AdScripts() {
  useEffect(() => {
    const specs: ScriptSpec[] = [
      {
        id: 'profitablecpm',
        src: 'https://www.profitablecpmratenetwork.com/pxw2hw5ur?key=b94c7ccb02ec5960dbcb4a9111298d12',
        async: true,
      },
      {
        id: 'highperformance-atoptions',
        inline: `window.atOptions = {
  'key' : '502e06c4685c2244fe3e150bfe4182fb',
  'format' : 'iframe',
  'height' : 50,
  'width' : 320,
  'params' : {}
};`,
      },
      {
        id: 'highperformance-invoke',
        src: 'https://www.highperformanceformat.com/502e06c4685c2244fe3e150bfe4182fb/invoke.js',
        async: true,
      },
      {
        id: 'vignette',
        src: 'https://n6wxm.com/vignette.min.js',
        attrs: { 'data-zone': '10782567' },
        target: 'body',
      },
      {
        id: 'nap5k',
        src: 'https://nap5k.com/tag.min.js',
        attrs: { 'data-zone': '10782572' },
        target: 'body',
      },
      {
        id: '5gvci',
        src: 'https://5gvci.com/act/files/tag.min.js?z=10782548',
        async: true,
        attrs: { 'data-cfasync': 'false' },
      },
    ]

    specs.forEach(injectScript)
  }, [])

  return null
}
