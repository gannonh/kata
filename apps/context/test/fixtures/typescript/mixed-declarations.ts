/**
 * A comprehensive fixture testing all declaration types together.
 */

/** Default timeout in milliseconds */
export const DEFAULT_TIMEOUT = 5000;

/** Greets with a prefix */
export function greet(name: string, prefix?: string): string {
  return `${prefix ?? "Hello"}, ${name}!`;
}

/** Event types */
export enum EventType {
  Click = "click",
  Hover = "hover",
}

/** Shape of an event */
export interface Event {
  type: EventType;
  timestamp: number;
}

/** Callback handler */
export type EventHandler = (event: Event) => void;

/** Manages event subscriptions */
export class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();

  /** Subscribe to an event */
  on(type: EventType, handler: EventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  /** Emit an event to all subscribers */
  emit(event: Event): void {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      handler(event);
    }
  }
}

// Non-function const — should NOT be extracted as a symbol
export const VERSION = "1.0.0";

/** Process handler as arrow */
export const createHandler = (bus: EventBus): EventHandler => {
  return (event: Event) => {
    console.log(event);
  };
};
