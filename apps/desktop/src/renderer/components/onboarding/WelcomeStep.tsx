import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Kata Desktop</p>
        <h2 className="text-3xl font-semibold text-foreground">Agentic Development Environment</h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Connect an AI provider, pick a model, and start chatting in under a minute.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Step 1 of 4</p>

        <Button type="button" onClick={onNext} size="lg">
          Get started
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  )
}
