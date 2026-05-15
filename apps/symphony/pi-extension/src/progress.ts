import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export const SYMPHONY_PROGRESS_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SymphonyProgressOptions {
  message: string;
  restoreStatus: (ctx: ExtensionCommandContext) => void;
}

export async function withSymphonyProgress<T>(
  ctx: ExtensionCommandContext,
  options: SymphonyProgressOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  ctx.ui.setWorkingIndicator({ frames: SYMPHONY_PROGRESS_FRAMES, intervalMs: 120 });
  ctx.ui.setWorkingMessage(options.message);
  ctx.ui.setStatus("symphony", options.message);

  try {
    return await fn();
  } finally {
    ctx.ui.setWorkingIndicator();
    ctx.ui.setWorkingMessage();
    options.restoreStatus(ctx);
  }
}

export async function withSymphonyLoader<T>(
  ctx: ExtensionCommandContext,
  options: SymphonyProgressOptions,
  fn: (signal: AbortSignal) => T | Promise<T>,
): Promise<T | undefined> {
  ctx.ui.setStatus("symphony", options.message);

  let operationFailed = false;
  let operationError: unknown;

  try {
    const result = await ctx.ui.custom<T | undefined>((tui, theme, _keybindings, done) => {
      const loader = new BorderedLoader(tui, theme, options.message);
      let completed = false;
      const complete = (value: T | undefined) => {
        if (completed) return;
        completed = true;
        done(value);
      };

      loader.onAbort = () => complete(undefined);

      void Promise.resolve()
        .then(() => fn(loader.signal))
        .then(
          (value) => complete(value),
          (error: unknown) => {
            if (completed) return;
            operationFailed = true;
            operationError = error;
            complete(undefined);
          },
        );
      return loader;
    });

    if (operationFailed) throw operationError;
    return result;
  } finally {
    options.restoreStatus(ctx);
  }
}
