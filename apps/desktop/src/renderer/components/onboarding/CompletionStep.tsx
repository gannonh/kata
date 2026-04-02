interface CompletionStepProps {
  selectedModel: string | null
  onBack: () => void
  onFinish: () => void
}

export function CompletionStep({ selectedModel, onBack, onFinish }: CompletionStepProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <h2 className="text-3xl font-semibold text-slate-100">You're all set!</h2>
        <p className="mt-2 text-sm text-slate-300">
          Your provider credentials are configured and shared with Kata CLI.
        </p>

        <div className="mt-5 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Default model</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {selectedModel ?? 'No model selected yet'}
          </p>
          {!selectedModel && (
            <p className="mt-2 text-xs text-slate-400">
              You can choose a model anytime from the toolbar model picker.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
        >
          Back
        </button>

        <button
          type="button"
          onClick={onFinish}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
        >
          Start chatting
        </button>
      </div>
    </div>
  )
}
