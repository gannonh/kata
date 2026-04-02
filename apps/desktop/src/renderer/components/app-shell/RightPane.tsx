export function RightPane() {
  return (
    <aside className="flex h-full flex-col bg-slate-900/60">
      <div className="flex h-14 items-center border-b border-slate-800 px-4">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300">Context Pane</h2>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-400">
        <div>
          <p className="font-medium text-slate-200">Kata Desktop</p>
          <p className="mt-2">Planning and kanban views are coming in M002/M003.</p>
        </div>
      </div>
    </aside>
  )
}
