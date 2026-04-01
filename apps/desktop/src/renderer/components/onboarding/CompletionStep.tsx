import { ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface CompletionStepProps {
  selectedModel: string | null
  onBack: () => void
  onFinish: () => void
}

export function CompletionStep({ selectedModel, onBack, onFinish }: CompletionStepProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-semibold text-foreground">You&apos;re all set!</h2>
          <p className="text-sm text-muted-foreground">
            Your provider credentials are configured and shared with Kata CLI.
          </p>
        </div>

        <Card className="border border-border bg-card/80 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Default model</p>
            <p className="text-sm font-semibold text-foreground">
              {selectedModel ?? 'No model selected yet'}
            </p>
            {!selectedModel && (
              <p className="pt-1 text-xs text-muted-foreground">
                You can choose a model anytime from the toolbar model picker.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Separator />

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>

          <Button type="button" onClick={onFinish} size="lg">
            <Check data-icon="inline-start" />
            Start chatting
          </Button>
        </div>
      </div>
    </div>
  )
}
