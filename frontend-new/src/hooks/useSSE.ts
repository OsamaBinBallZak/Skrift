import { useState, useRef, useCallback } from 'react'

interface SSEState {
  streaming: boolean
  text: string
  error: string | null
}

export function useSSE() {
  const [state, setState] = useState<SSEState>({ streaming: false, text: '', error: null })
  const cleanupRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setState(s => ({ ...s, streaming: false }))
  }, [])

  const start = useCallback((
    startStream: (callbacks: { onToken: (t: string) => void; onDone: (full: string) => void; onError: (msg: string) => void }) => () => void,
    onComplete?: (fullText: string) => void,
  ) => {
    stop()
    setState({ streaming: true, text: '', error: null })

    const cleanup = startStream({
      onToken: (t) => setState(s => ({ ...s, text: s.text + t })),
      onDone: (full) => {
        setState({ streaming: false, text: full, error: null })
        onComplete?.(full)
      },
      onError: (msg) => setState({ streaming: false, text: '', error: msg }),
    })

    cleanupRef.current = cleanup
  }, [stop])

  const reset = useCallback(() => {
    stop()
    setState({ streaming: false, text: '', error: null })
  }, [stop])

  return { ...state, start, stop, reset }
}
