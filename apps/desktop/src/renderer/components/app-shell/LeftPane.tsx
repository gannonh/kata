import { ChatPanel } from '../chat/ChatPanel'

export function LeftPane() {
  return (
    <section className="h-full border-r border-slate-800 bg-slate-950">
      <div className="flex h-14 items-center border-b border-slate-800 px-4">
        <h1 className="text-sm font-semibold tracking-wide uppercase text-slate-200">Kata Desktop</h1>
      </div>
      <ChatPanel />
    </section>
  )
}
