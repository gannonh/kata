interface ErrorBannerProps {
  title?: string
  message: string
  onRestart?: () => Promise<void> | void
}

export function ErrorBanner({ title = 'Agent error', message, onRestart }: ErrorBannerProps) {
  return (
    <div className="mx-4 mb-3 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{title}</p>
        {onRestart && (
          <button
            type="button"
            onClick={() => {
              void onRestart()
            }}
            className="rounded border border-red-300/60 px-2 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
          >
            Restart
          </button>
        )}
      </div>
      <p className="mt-1 text-red-100/90">{message}</p>
    </div>
  )
}
