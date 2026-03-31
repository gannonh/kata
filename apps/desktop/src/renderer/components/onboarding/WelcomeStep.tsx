interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Kata Desktop</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-100">Welcome to your coding co-pilot</h2>
        <p className="mt-3 max-w-xl text-sm text-slate-300">
          Connect an AI provider, pick a model, and start chatting in under a minute.
        </p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-slate-400">Step 1 of 4</p>
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
        >
          Get started
        </button>
      </div>
    </div>
  )
}
