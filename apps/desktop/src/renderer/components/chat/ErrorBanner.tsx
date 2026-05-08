import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ErrorBannerProps {
  title?: string
  message: string
  onRestart?: () => Promise<void> | void
}

export function ErrorBanner({ title = 'Agent error', message, onRestart }: ErrorBannerProps) {
  return (
    <Alert variant="destructive" className="mx-4 mb-3">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRestart && (
        <AlertAction>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => {
              void onRestart()
            }}
          >
            Restart
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
