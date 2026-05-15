import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { eventStreamUrl, startSymphonyEventStream } from "./event-stream.ts";

let server: Server | undefined;
let socketServer: WebSocketServer | undefined;

afterEach(async () => {
  socketServer?.close();
  socketServer = undefined;
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    server = undefined;
  }
});

async function serveWebSocket(): Promise<{ baseUrl: string; socketServer: WebSocketServer }> {
  server = createServer();
  socketServer = new WebSocketServer({ server, path: "/api/v1/events" });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  return { baseUrl: `http://127.0.0.1:${address.port}`, socketServer };
}

describe("event stream", () => {
  it("converts HTTP API base URLs into WebSocket event URLs", () => {
    expect(eventStreamUrl("http://127.0.0.1:8080")).toBe("ws://127.0.0.1:8080/api/v1/events");
    expect(eventStreamUrl("https://example.test/base")).toBe("wss://example.test/base/api/v1/events");
  });

  it("delivers parsed Symphony event envelopes", async () => {
    const { baseUrl, socketServer } = await serveWebSocket();
    const received = new Promise<unknown>((resolve) => {
      const handle = startSymphonyEventStream({
        baseUrl,
        onEvent: (event) => {
          handle.close();
          resolve(event);
        },
        onError: (error) => resolve(error),
      });
    });

    socketServer.on("connection", (socket) => {
      socket.send(JSON.stringify({
        version: "v1",
        sequence: 7,
        timestamp: "2026-05-14T12:00:00Z",
        kind: "worker",
        severity: "info",
        issue: "SIM-123",
        event: "worker_completed",
        payload: { summary: "done" },
      }));
    });

    await expect(received).resolves.toMatchObject({ sequence: 7, kind: "worker", event: "worker_completed" });
  });

  it("reports malformed event stream messages", async () => {
    const { baseUrl, socketServer } = await serveWebSocket();
    const onError = vi.fn();
    const reported = new Promise<void>((resolve) => {
      onError.mockImplementation(() => resolve());
    });
    const handle = startSymphonyEventStream({ baseUrl, onEvent: () => undefined, onError });

    socketServer.on("connection", (socket) => {
      socket.send("not-json");
    });

    await reported;
    handle.close();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("invalid Symphony event") }));
  });

  it("does not report an error when intentionally closed before connecting", async () => {
    const onError = vi.fn();
    const handle = startSymphonyEventStream({
      baseUrl: "http://127.0.0.1:9",
      onEvent: () => undefined,
      onError,
    });

    handle.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onError).not.toHaveBeenCalled();
  });

  it("reports an error when the server closes the stream", async () => {
    const { baseUrl, socketServer } = await serveWebSocket();
    const onError = vi.fn();
    const handle = startSymphonyEventStream({ baseUrl, onEvent: () => undefined, onError });

    socketServer.on("connection", (socket) => {
      socket.close(1000, "server shutdown");
    });

    await expect.poll(() => onError.mock.calls.length, { interval: 10, timeout: 1000 }).toBe(1);
    handle.close();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Symphony event stream closed") }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("server shutdown") }));
  });
});
