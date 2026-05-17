#!/usr/bin/env node
import { createServer } from "node:http";

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const state = createInitialState();
const responses = [];

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += String(chunk);
  });
  req.on("end", () => {
    handleRequest(req, res, body);
  });
});

server.listen(options.port, options.host, () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  const baseUrl = `http://${options.host}:${address.port}`;
  console.log(`Mock Symphony server: ${baseUrl}`);
  console.log("");
  console.log("Attach from Pi:");
  console.log(`/symphony:attach ${baseUrl}`);
  console.log("/symphony:console");
  console.log("");
  console.log("Seeded state: running SIM-123, retry SIM-200, blocked SIM-300, completed SIM-400, escalation esc-1");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function handleRequest(req, res, body) {
  setJson(res);

  if (req.method === "GET" && req.url === "/api/v1/state") {
    res.end(JSON.stringify(state));
    return;
  }

  if (req.method === "GET" && req.url === "/api/v1/escalations") {
    res.end(JSON.stringify({ pending: state.pending_escalations }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/v1/refresh") {
    res.statusCode = 202;
    res.end(JSON.stringify({ queued: true, coalesced: false, pending_requests: 1 }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/v1/steer") {
    const payload = parseJsonBody(body);
    const instruction = typeof payload?.instruction === "string" ? payload.instruction : "";
    res.end(JSON.stringify({
      ok: true,
      issue_id: "issue-123",
      issue_identifier: "SIM-123",
      delivered: true,
      instruction_preview: instruction.slice(0, 120),
    }));
    return;
  }

  const escalationMatch = req.url?.match(/^\/api\/v1\/escalations\/([^/]+)\/respond$/);
  if (req.method === "POST" && escalationMatch) {
    let requestId;
    try {
      requestId = decodeURIComponent(escalationMatch[1]);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "invalid_escalation_id" }));
      return;
    }
    const escalation = state.pending_escalations.find((entry) => entry.request_id === requestId);
    if (!escalation) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "escalation_not_found" }));
      return;
    }

    responses.push({ request_id: requestId, body: parseJsonBody(body), received_at: new Date().toISOString() });
    state.pending_escalations = state.pending_escalations.filter((entry) => entry.request_id !== requestId);
    state.supervisor.escalations_created = state.pending_escalations.length;
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/debug/responses") {
    res.end(JSON.stringify({ responses }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not_found" }));
}

function createInitialState() {
  return {
    poll_interval_ms: 30000,
    max_concurrent_agents: 2,
    tracker_project_url: "https://linear.app/kata-sh/project/symphony",
    running: {
      "issue-123": {
        issue_id: "issue-123",
        issue_identifier: "SIM-123",
        issue_title: "Running worker",
        attempt: 1,
        workspace_path: "/tmp/symphony/issue-123",
        started_at: "2026-05-14T12:00:00Z",
        status: "running",
        tracker_state: "In Progress",
        worker_host: "local",
        model: "test-model",
        issue_url: "https://linear.app/kata-sh/issue/SIM-123/running-worker",
      },
    },
    running_sessions: {
      "issue-123": {
        turn_count: 3,
        last_activity_at: "2026-05-14T12:04:00Z",
        total_tokens: 1200,
        last_event: "tool_call_completed",
        last_event_message: "running cargo test",
        session_id: "session-123",
      },
    },
    running_session_info: {
      "issue-123": {
        turn_count: 3,
        max_turns: 20,
        last_activity_ms: Date.parse("2026-05-14T12:04:00Z"),
        session_tokens: { input_tokens: 800, output_tokens: 400, total_tokens: 1200 },
        last_error: null,
      },
    },
    claimed: [],
    retry_queue: [
      {
        issue_id: "issue-retry",
        identifier: "SIM-200",
        attempt: 3,
        due_in_ms: 90000,
        error: "rate limit",
        worker_host: "host-b",
        workspace_path: "/tmp/retry",
      },
    ],
    blocked: [
      {
        issue_id: "issue-blocked",
        identifier: "SIM-300",
        title: "Blocked work",
        state: "Todo",
        blocker_identifiers: ["SIM-100", "SIM-101"],
      },
    ],
    completed: [
      {
        issue_id: "issue-done",
        identifier: "SIM-400",
        title: "Done work",
        completed_at: "2026-05-14T13:00:00Z",
      },
    ],
    pending_escalations: [
      {
        request_id: "esc-1",
        issue_id: "issue-123",
        issue_identifier: "SIM-123",
        method: "approval",
        preview: "Approve cargo test?",
        created_at: "2026-05-14T12:06:00Z",
        timeout_ms: 600000,
      },
    ],
    shared_context: { total_entries: 0, entries_by_scope: {}, oldest_entry_at: null, newest_entry_at: null },
    supervisor: { active: true, steers_issued: 0, conflicts_detected: 0, patterns_detected: 0, escalations_created: 1 },
    codex_totals: { input_tokens: 800, output_tokens: 400, total_tokens: 1200, event_count: 2, seconds_running: 60 },
    codex_rate_limits: null,
    polling: { checking: false, next_poll_in_ms: 1000, poll_interval_ms: 30000, poll_count: 1, last_poll_at: "2026-05-14T12:05:00Z" },
  };
}

function parseArgs(args) {
  const parsed = { host: "127.0.0.1", port: 8787, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--host") {
      parsed.host = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--port") {
      const rawPort = readValue(args, index, arg);
      const port = Number(rawPort);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid --port value: ${rawPort}`);
      }
      parsed.port = port;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parseJsonBody(body) {
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function setJson(res) {
  res.setHeader("content-type", "application/json");
}

function shutdown() {
  server.close(() => process.exit(0));
}

function printHelp() {
  console.log(`Usage: node apps/symphony/pi-extension/scripts/wave3-mock-server.mjs [--host 127.0.0.1] [--port 8787]\n\nStarts a local mock Symphony HTTP API seeded with Wave 3 dashboard state.\n\nEndpoints:\n  GET  /api/v1/state\n  GET  /api/v1/escalations\n  POST /api/v1/escalations/esc-1/respond\n  POST /api/v1/refresh\n  POST /api/v1/steer\n\nAttach from Pi with /symphony:attach http://127.0.0.1:<port>.`);
}
