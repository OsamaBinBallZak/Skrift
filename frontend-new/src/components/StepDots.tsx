import type { ProcessingSteps } from '@/types/pipeline'

// Step order, colours, and labels match the backend's pipeline stages
const STEPS: Array<{
  key: keyof ProcessingSteps
  color: string
  label: string
}> = [
  { key: 'transcribe', color: '#60a5fa', label: 'Transcribed' },
  { key: 'sanitise', color: '#a78bfa', label: 'Cleaned Up' },
  { key: 'enhance', color: '#f59e0b', label: 'Enhanced' },
  { key: 'export', color: '#34d399', label: 'Exported' },
]

interface StepDotsProps {
  steps: ProcessingSteps
}

export function StepDots({ steps }: StepDotsProps) {
  const title = STEPS.map(s => `${s.label}: ${steps[s.key]}`).join(' · ')

  return (
    <div className="flex gap-[3px] shrink-0" title={title} aria-label={title}>
      {STEPS.map(({ key, color, label }) => {
        const status = steps[key]
        const done = status === 'done'
        const processing = status === 'processing'

        return (
          <div
            key={key}
            aria-label={`${label}: ${status}`}
            className="w-[7px] h-[7px] rounded-full transition-colors"
            style={{
              background: done
                ? color
                : processing
                  ? `${color}66`
                  : 'rgba(128,128,128,0.2)',
              // Faint pulse ring when processing
              boxShadow: processing ? `0 0 0 2px ${color}33` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
