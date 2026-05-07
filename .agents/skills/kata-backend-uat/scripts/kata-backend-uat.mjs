#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SKILL_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_LINEAR_STATES = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  agent_review: "Agent Review",
  human_review: "Human Review",
  merging: "Merging",
  done: "Done",
};
const SKILL_FOR_OPERATION = {
  "health.check": "kata-health",
  "project.getContext": "kata-new-project",
  "project.upsert": "kata-new-project",
  "project.getSnapshot": "kata-progress",
  "milestone.create": "kata-new-milestone",
  "milestone.list": "kata-new-milestone",
  "milestone.getActive": "kata-new-milestone",
  "milestone.complete": "kata-complete-milestone",
  "slice.create": "kata-plan-phase",
  "slice.list": "kata-plan-phase",
  "slice.updateStatus": "kata-execute-phase",
  "task.create": "kata-plan-phase",
  "task.list": "kata-execute-phase",
  "task.updateStatus": "kata-execute-phase",
  "issue.create": "kata-plan-issue",
  "issue.get": "kata-plan-issue",
  "issue.updateStatus": "kata-execute-issue",
  "issue.listOpen": "kata-plan-issue",
  "artifact.write": "kata-execute-phase",
  "artifact.list": "kata-progress",
  "artifact.read": "kata-progress",
  "execution.getStatus": "kata-progress",
};
const RETRYABLE_PATTERN = /429|500|502|503|504|timeout|ETIMEDOUT|ECONNRESET|NETWORK/i;
const NON_IDEMPOTENT_OPERATIONS = new Set([
  "milestone.create",
  "slice.create",
  "task.create",
  "issue.create",
  "artifact.write",
]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] ?? "help";

  if (command === "help" || args.help) {
    printHelp();
    return;
  }

  if (command === "update") {
    updateGeneratedContract(args);
    return;
  }

  if (command === "cleanup") {
    await cleanupRun(args);
    return;
  }

  if (command === "test") {
    await testBackend(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function printHelp() {
  console.log(`kata-backend-uat

Commands:
  test --backend github|linear [--workspace path] [--cli-root path] [--output-dir path] [--dry-run]
  update [--workspace path] [--cli-root path]
  cleanup --evidence /path/to/evidence.json [--workspace path] [--cli-root path]

GitHub overrides:
  --github-owner owner --github-repo repo --github-project-number 17

Linear overrides:
  --linear-workspace kata-sh --linear-team KAT --linear-project project-id-or-slug
`);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }
    const stripped = arg.slice(2);
    const eqIndex = stripped.indexOf("=");
    const rawKey = eqIndex === -1 ? stripped : stripped.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? undefined : stripped.slice(eqIndex + 1);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      result[key] = argv[index + 1];
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

async function testBackend(args) {
  const workspace = path.resolve(String(args.workspace ?? process.cwd()));
  const cliRoot = resolveCliRoot(args, workspace);
  const backend = String(args.backend ?? "").trim();
  if (backend !== "github" && backend !== "linear") {
    throw new Error("test requires --backend github or --backend linear");
  }

  const env = loadEnv(workspace, { ...process.env, KATA_CLI_ROOT: cliRoot });
  const operations = readOperationNames(cliRoot);
  const stamp = timestamp();
  const runDir = path.resolve(String(args.output_dir ?? mkdtempSync(path.join(tmpdir(), `kata-${backend}-uat-`))));
  mkdirSync(path.join(runDir, "payloads"), { recursive: true });
  mkdirSync(path.join(runDir, ".kata"), { recursive: true });

  const config = backend === "github"
    ? githubConfig(args, workspace)
    : linearConfig(args, env);
  writeFileSync(path.join(runDir, ".kata", "preferences.md"), preferencesFor(backend, config), "utf8");

  const evidence = {
    backend,
    stamp,
    workspace,
    cliRoot,
    runDir,
    gitCommit: gitCommit(workspace),
    cliVersion: readCliVersion(cliRoot),
    config: redactConfig(config),
    operations: [],
    retries: [],
    markerChecks: [],
    documentChecks: [],
    nonIdempotentRetryRisks: [],
    created: {},
    operationCoverage: null,
    cleanup: { completed: false },
  };

  if (args.dry_run) {
    evidence.operationCoverage = { expected: operations.length, observed: 0, missing: operations };
    writeEvidence(runDir, evidence);
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      backend,
      runDir,
      operations,
      config: evidence.config,
      evidence: path.join(runDir, "evidence.json"),
      report: path.join(runDir, "evidence.md"),
    }, null, 2));
    return;
  }

  const call = createCaller({ root: cliRoot, runDir, env, evidence });

  console.log(JSON.stringify({ backend, runDir, stamp }));
  const health = await call("health.check");
  evidence.health = health;
  if (health?.ok !== true) {
    throw new Error(`health.check failed: ${JSON.stringify(health?.checks ?? health)}`);
  }

  await call("project.getContext");
  await call("project.upsert", { title: "Kata Mono", description: "Kata backend UAT project record." });

  const projectArtifact = await call("artifact.write", {
    scopeType: "project",
    scopeId: "PROJECT",
    artifactType: "project-brief",
    title: "PROJECT Project Brief",
    content: `# Project Brief\n\n${backend} UAT proof ${stamp}.`,
    format: "markdown",
  });
  await call("artifact.list", { scopeType: "project", scopeId: "PROJECT" });
  await call("artifact.read", { scopeType: "project", scopeId: "PROJECT", artifactType: "project-brief" });

  const milestone = await call("milestone.create", {
    title: `${titleCase(backend)} UAT ${stamp}`,
    goal: `Verify every Kata CLI operation through ${backend} ${stamp}.`,
  });
  evidence.created.milestone = milestone;

  if (backend === "linear") {
    config.activeMilestoneId = milestone.id;
    writeFileSync(path.join(runDir, ".kata", "preferences.md"), preferencesFor(backend, config), "utf8");
    evidence.config = redactConfig(config);
  }

  await call("milestone.getActive");
  await call("milestone.list");

  const requirements = await call("artifact.write", {
    scopeType: "milestone",
    scopeId: milestone.id,
    artifactType: "requirements",
    title: `${milestone.id} Requirements`,
    content: `# Requirements\n\n- [ ] ${backend.toUpperCase()}-${stamp}-01 Operation coverage.\n- [ ] ${backend.toUpperCase()}-${stamp}-02 Artifact proof links.`,
    format: "markdown",
  });
  await call("artifact.list", { scopeType: "milestone", scopeId: milestone.id });
  await call("artifact.read", { scopeType: "milestone", scopeId: milestone.id, artifactType: "requirements" });

  const sliceA = await call("slice.create", {
    milestoneId: milestone.id,
    title: `${titleCase(backend)} foundation ${stamp}`,
    goal: `Prove ${backend} slice operations ${stamp}.`,
    order: 1,
  });
  const sliceB = await call("slice.create", {
    milestoneId: milestone.id,
    title: `${titleCase(backend)} dependent ${stamp}`,
    goal: `Prove ${backend} dependency operations ${stamp}.`,
    order: 2,
    blockedBy: [sliceA.id],
  });
  evidence.created.slices = [sliceA, sliceB];

  const roadmap = await call("artifact.write", {
    scopeType: "milestone",
    scopeId: milestone.id,
    artifactType: "roadmap",
    title: `${milestone.id} Roadmap`,
    content: `# Roadmap\n\n- [ ] ${sliceA.id}: coverage\n- [ ] ${sliceB.id}: proof links\n\nDependencies: ${sliceB.id} blocked by ${sliceA.id}.`,
    format: "markdown",
  });
  await call("artifact.list", { scopeType: "milestone", scopeId: milestone.id });
  await call("artifact.read", { scopeType: "milestone", scopeId: milestone.id, artifactType: "roadmap" });
  await call("slice.list", { milestoneId: milestone.id });

  const taskA = await call("task.create", {
    sliceId: sliceA.id,
    title: `Verify ${titleCase(backend)} artifact proof ${stamp}`,
    description: `Verify generated artifact links for ${backend}.`,
  });
  const taskB = await call("task.create", {
    sliceId: sliceB.id,
    title: `Verify ${titleCase(backend)} operation coverage ${stamp}`,
    description: `Verify operation coverage for ${backend}.`,
  });
  evidence.created.tasks = [taskA, taskB];
  await call("task.list", { sliceId: sliceA.id });
  await call("task.list", { sliceId: sliceB.id });

  const sliceArtifact = await call("artifact.write", {
    scopeType: "slice",
    scopeId: sliceA.id,
    artifactType: "plan",
    title: `${sliceA.id} Plan`,
    content: `# Plan\n\n${backend} slice artifact proof ${stamp}.`,
    format: "markdown",
  });
  const taskArtifact = await call("artifact.write", {
    scopeType: "task",
    scopeId: taskA.id,
    artifactType: "verification",
    title: `${taskA.id} Verification`,
    content: `# Verification\n\n${backend} task artifact proof ${stamp}.`,
    format: "markdown",
  });
  await call("artifact.list", { scopeType: "slice", scopeId: sliceA.id });
  await call("artifact.read", { scopeType: "task", scopeId: taskA.id, artifactType: "verification" });

  await call("slice.updateStatus", { sliceId: sliceA.id, status: "done" });
  await call("task.updateStatus", { taskId: taskA.id, status: "done", verificationState: "verified" });
  await call("slice.updateStatus", { sliceId: sliceB.id, status: "done" });
  await call("task.updateStatus", { taskId: taskB.id, status: "done", verificationState: "verified" });

  const issue = await call("issue.create", {
    title: `${titleCase(backend)} standalone issue ${stamp}`,
    design: `Design proof for ${backend} standalone issue path ${stamp}.`,
    plan: `Plan proof for ${backend} standalone issue path ${stamp}.`,
  });
  evidence.created.issue = issue;
  await call("issue.listOpen");
  await call("issue.get", { issueRef: issue.id });
  await call("issue.updateStatus", { issueId: issue.id, status: "todo" });
  await call("issue.updateStatus", { issueId: issue.id, status: "done" });

  const issueArtifact = await call("artifact.write", {
    scopeType: "issue",
    scopeId: issue.id,
    artifactType: "plan",
    title: `${issue.id} Plan`,
    content: `# Plan\n\n${backend} issue artifact proof ${stamp}.`,
    format: "markdown",
  });
  await call("artifact.list", { scopeType: "issue", scopeId: issue.id });
  await call("artifact.read", { scopeType: "issue", scopeId: issue.id, artifactType: "plan" });

  if (backend === "github") {
    await verifyGithubComment(env, config, evidence, "project-project-brief", projectArtifact, "project-brief");
    await verifyGithubComment(env, config, evidence, "milestone-requirements", requirements, "requirements");
    await verifyGithubComment(env, config, evidence, "milestone-roadmap", roadmap, "roadmap");
    await verifyGithubComment(env, config, evidence, "slice-plan", sliceArtifact, "plan");
    await verifyGithubComment(env, config, evidence, "task-verification", taskArtifact, "verification");
    await verifyGithubComment(env, config, evidence, "issue-plan", issueArtifact, "plan");
  } else {
    await verifyLinearDocument(env, evidence, "project-project-brief", projectArtifact, "PROJECT Project Brief");
    await verifyLinearDocument(env, evidence, "milestone-requirements", requirements, `${milestone.id} Requirements`);
    await verifyLinearDocument(env, evidence, "milestone-roadmap", roadmap, `${milestone.id} Roadmap`);
    await verifyLinearComment(env, evidence, "slice-plan", sliceArtifact, "plan");
    await verifyLinearComment(env, evidence, "task-verification", taskArtifact, "verification");
    await verifyLinearComment(env, evidence, "issue-plan", issueArtifact, "plan");
  }

  const snapshot = await call("project.getSnapshot");
  evidence.snapshotReadiness = snapshot.readiness;
  await call("execution.getStatus");
  const completedMilestone = await call("milestone.complete", {
    milestoneId: milestone.id,
    summary: `Completed ${backend} UAT proof ${stamp}.`,
  });
  evidence.created.completedMilestone = completedMilestone;
  evidence.cleanup.completed = true;

  const observed = [...new Set(evidence.operations.map((entry) => entry.operation))];
  const missing = operations.filter((operation) => !observed.includes(operation));
  evidence.operationCoverage = { expected: operations.length, observed: observed.length, missing };
  if (missing.length > 0) {
    throw new Error(`Missing operation coverage: ${missing.join(", ")}`);
  }

  writeEvidence(runDir, evidence);
  console.log(JSON.stringify({
    ok: true,
    backend,
    runDir,
    evidence: path.join(runDir, "evidence.json"),
    report: path.join(runDir, "evidence.md"),
    operationCoverage: evidence.operationCoverage,
  }, null, 2));
}

async function cleanupRun(args) {
  const evidencePath = args.evidence ? path.resolve(String(args.evidence)) : null;
  if (!evidencePath || !existsSync(evidencePath)) {
    throw new Error("cleanup requires --evidence /path/to/evidence.json");
  }
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const workspace = path.resolve(String(args.workspace ?? evidence.workspace ?? process.cwd()));
  const cliRoot = resolveCliRoot(args, workspace);
  const env = loadEnv(workspace, { ...process.env, KATA_CLI_ROOT: cliRoot });
  const runDir = mkdtempSync(path.join(tmpdir(), `kata-${evidence.backend}-cleanup-`));
  mkdirSync(path.join(runDir, ".kata"), { recursive: true });
  mkdirSync(path.join(runDir, "payloads"), { recursive: true });

  const config = evidence.config ?? {};
  if (evidence.backend === "linear" && evidence.created?.milestone?.id) {
    config.activeMilestoneId = evidence.created.milestone.id;
  }
  writeFileSync(path.join(runDir, ".kata", "preferences.md"), preferencesFor(evidence.backend, config), "utf8");

  const cleanupEvidence = { backend: evidence.backend, runDir, operations: [], retries: [] };
  const call = createCaller({ root: cliRoot, runDir, env, evidence: cleanupEvidence });
  const milestoneId = evidence.created?.milestone?.id;
  if (!milestoneId) {
    throw new Error("Evidence does not include created.milestone.id");
  }
  const result = await call("milestone.complete", {
    milestoneId,
    summary: `Cleanup completion for prior UAT run ${evidence.stamp ?? ""}`.trim(),
  });
  console.log(JSON.stringify({ ok: true, backend: evidence.backend, milestoneId, result }, null, 2));
}

function updateGeneratedContract(args) {
  const workspace = path.resolve(String(args.workspace ?? process.cwd()));
  const cliRoot = resolveCliRoot(args, workspace);
  const contract = {
    workspace: ".",
    cliRoot: relativeContractPath(workspace, cliRoot),
    gitCommit: gitCommit(workspace),
    cliVersion: readCliVersion(cliRoot),
    operations: readOperationNames(cliRoot),
    backends: readBackendKinds(cliRoot),
  };
  const outputPath = path.join(SKILL_ROOT, "references", "generated-cli-contract.json");
  writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, outputPath, contract }, null, 2));
}

function createCaller({ root, runDir, env, evidence }) {
  return async function call(operation, payload) {
    const skill = SKILL_FOR_OPERATION[operation] ?? "kata-progress";
    const script = path.join(root, "skills", skill, "scripts", "kata-call.mjs");
    if (!existsSync(script)) throw new Error(`Missing skill helper for ${operation}: ${script}`);

    const args = [script, operation];
    let payloadPath = null;
    if (payload !== undefined) {
      payloadPath = path.join(
        runDir,
        "payloads",
        `${operation.replace(".", "-")}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
      );
      writeFileSync(payloadPath, JSON.stringify(payload, null, 2), "utf8");
      args.push("--input", payloadPath);
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const child = spawnSync(process.execPath, args, {
        cwd: runDir,
        env,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16,
      });
      const parsed = parseJson(child.stdout);
      if (child.status === 0 && parsed?.ok) {
        const summary = summarize(parsed.data);
        evidence.operations.push({ operation, attempt, payloadPath, summary });
        console.log(`${operation} ok ${JSON.stringify(summary)}`);
        return parsed.data;
      }

      const message = parsed?.error?.message ?? child.stderr ?? child.stdout;
      if (attempt < 5 && RETRYABLE_PATTERN.test(message)) {
        if (NON_IDEMPOTENT_OPERATIONS.has(operation)) {
          evidence.nonIdempotentRetryRisks.push({ operation, attempt, message: String(message).slice(0, 500) });
          throw new Error(`${operation} failed after ${attempt} attempt(s): ${String(message).slice(0, 1000)}`);
        }
        evidence.retries.push({ operation, attempt, message: String(message).slice(0, 500) });
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(`${operation} failed after ${attempt} attempt(s): ${String(message).slice(0, 1000)}`);
    }
  };
}

async function verifyGithubComment(env, config, evidence, label, artifact, expectedType) {
  const id = String(artifact.provenance?.backendId ?? "").replace("comment:", "");
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!id || !token) throw new Error(`Cannot verify GitHub comment for ${label}`);
  const comment = await githubRest(token, `/repos/${config.repoOwner}/${config.repoName}/issues/comments/${id}`);
  const body = String(comment.body ?? "");
  const expected = `<!-- kata:artifact {"artifactType":"${expectedType}"} -->`;
  if (!body.startsWith(expected)) throw new Error(`${label} marker was not compact`);
  if (body.includes('"scopeType"') || body.includes('"scopeId"')) {
    throw new Error(`${label} marker contains scope metadata`);
  }
  evidence.markerChecks.push({
    label,
    backendId: artifact.provenance.backendId,
    url: comment.html_url,
    compact: true,
  });
}

async function verifyLinearComment(env, evidence, label, artifact, expectedType) {
  const id = String(artifact.provenance?.backendId ?? "").replace("comment:", "");
  const comment = await linearGraphql(env, `query($id:String!){ comment(id:$id){ id body url } }`, { id });
  const body = String(comment.comment?.body ?? "");
  const expected = `<!-- kata:artifact {"artifactType":"${expectedType}"} -->`;
  if (!body.startsWith(expected)) throw new Error(`${label} marker was not compact`);
  if (body.includes('"scopeType"') || body.includes('"scopeId"')) {
    throw new Error(`${label} marker contains scope metadata`);
  }
  evidence.markerChecks.push({
    label,
    backendId: artifact.provenance.backendId,
    url: comment.comment?.url,
    compact: true,
  });
}

async function verifyLinearDocument(env, evidence, label, artifact, expectedTitle) {
  const id = String(artifact.provenance?.backendId ?? "").replace("document:", "");
  const data = await linearGraphql(env, `query($id:String!){ document(id:$id){ id title content url } }`, { id });
  const doc = data.document;
  const content = String(doc?.content ?? "");
  if (doc?.title !== expectedTitle) throw new Error(`${label} title mismatch: ${doc?.title}`);
  if (content.includes("<!-- kata:artifact")) throw new Error(`${label} document contains inline marker`);
  evidence.documentChecks.push({
    label,
    backendId: artifact.provenance.backendId,
    title: doc.title,
    url: doc.url,
    markerPresent: false,
  });
}

async function githubRest(token, apiPath) {
  const response = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub REST ${apiPath} failed ${response.status}: ${await response.text()}`);
  return response.json();
}

async function linearGraphql(env, query, variables) {
  const token = env.LINEAR_API_KEY || env.LINEAR_TOKEN;
  if (!token) throw new Error("Linear verification requires LINEAR_API_KEY or LINEAR_TOKEN");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(`Linear GraphQL failed: ${JSON.stringify(payload.errors ?? payload).slice(0, 1000)}`);
  }
  return payload.data;
}

function writeEvidence(runDir, evidence) {
  const jsonPath = path.join(runDir, "evidence.json");
  const mdPath = path.join(runDir, "evidence.md");
  writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, evidenceMarkdown(evidence, jsonPath), "utf8");
}

function evidenceMarkdown(evidence, jsonPath) {
  const links = [
    ...(evidence.markerChecks ?? []).map((check) => `- ${check.label}: ${check.url ?? check.backendId}`),
    ...(evidence.documentChecks ?? []).map((check) => `- ${check.label}: ${check.url ?? check.backendId}`),
  ].join("\n");
  return `# Kata Backend UAT Evidence

- Backend: ${evidence.backend}
- Stamp: ${evidence.stamp}
- Git commit: ${evidence.gitCommit}
- CLI version: ${evidence.cliVersion}
- Evidence JSON: ${jsonPath}
- Health: ${evidence.health?.ok === true ? "ok" : "failed"}
- Operation coverage: ${evidence.operationCoverage?.observed}/${evidence.operationCoverage?.expected}
- Missing operations: ${(evidence.operationCoverage?.missing ?? []).join(", ") || "none"}
- Milestone: ${evidence.created?.completedMilestone?.id ?? evidence.created?.milestone?.id ?? "unknown"}
- Issue: ${evidence.created?.issue?.url ?? evidence.created?.issue?.id ?? "unknown"}

## Artifact Proof Links

${links || "No links recorded."}
`;
}

function preferencesFor(backend, config) {
  if (backend === "github") {
    return `---\nworkflow:\n  mode: github\ngithub:\n  repoOwner: ${config.repoOwner}\n  repoName: ${config.repoName}\n  stateMode: projects_v2\n  githubProjectNumber: ${config.projectNumber}\n---\n`;
  }

  const states = { ...DEFAULT_LINEAR_STATES, ...(config.states ?? {}) };
  const active = config.activeMilestoneId ? `  activeMilestoneId: ${config.activeMilestoneId}\n` : "";
  return `---\nworkflow:\n  mode: linear\nlinear:\n  workspace: ${config.workspace}\n  team: ${config.team}\n  project: ${config.project}\n  authEnv: ${config.authEnv ?? "LINEAR_API_KEY"}\n${active}  states:\n${Object.entries(states).map(([key, value]) => `    ${key}: ${value}`).join("\n")}\n  labels:\n    slice: kata:slice\n    task: kata:task\n    issue: kata:artifact\n---\n`;
}

function githubConfig(args, workspace) {
  const preferences = readPreferences(path.join(workspace, ".kata", "preferences.md"));
  return {
    repoOwner: String(args.github_owner ?? preferences.github?.repoOwner ?? "gannonh"),
    repoName: String(args.github_repo ?? preferences.github?.repoName ?? "kata"),
    projectNumber: Number(args.github_project_number ?? preferences.github?.githubProjectNumber ?? 17),
  };
}

function linearConfig(args, env) {
  return {
    workspace: String(args.linear_workspace ?? "kata-sh"),
    team: String(args.linear_team ?? "KAT"),
    project: String(args.linear_project ?? env.LINEAR_PROJECT_ID ?? ""),
    authEnv: String(args.linear_auth_env ?? "LINEAR_API_KEY"),
  };
}

function readPreferences(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const github = {};
  for (const key of ["repoOwner", "repoName", "githubProjectNumber"]) {
    const match = content.match(new RegExp(`\\n\\s*${key}:\\s*([^\\n]+)`));
    if (match) github[key] = match[1].trim();
  }
  if (github.githubProjectNumber) github.githubProjectNumber = Number(github.githubProjectNumber);
  return { github };
}

function readOperationNames(cliRoot) {
  const filePath = path.join(cliRoot, "src", "domain", "operations.ts");
  if (!existsSync(filePath)) return readGeneratedContract().operations ?? [];
  const content = readFileSync(filePath, "utf8");
  const arrayMatch = content.match(/KATA_OPERATION_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!arrayMatch) throw new Error(`Unable to parse KATA_OPERATION_NAMES in ${filePath}`);
  return [...arrayMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function readBackendKinds(cliRoot) {
  const filePath = path.join(cliRoot, "src", "domain", "types.ts");
  if (!existsSync(filePath)) return readGeneratedContract().backends ?? [];
  const content = readFileSync(filePath, "utf8");
  const match = content.match(/KataBackendKind\s*=\s*([^;]+);/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function readGeneratedContract() {
  const filePath = path.join(SKILL_ROOT, "references", "generated-cli-contract.json");
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : {};
}

function resolveCliRoot(args, workspace) {
  if (args.cli_root) return path.resolve(String(args.cli_root));
  if (process.env.KATA_CLI_ROOT) return path.resolve(String(process.env.KATA_CLI_ROOT));
  const local = path.join(workspace, "apps", "cli");
  if (existsSync(local)) return local;
  return workspace;
}

function relativeContractPath(workspace, target) {
  const relative = path.relative(workspace, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : ".";
}

function loadEnv(workspace, baseEnv) {
  const env = { ...baseEnv };
  const envPath = path.join(workspace, ".env");
  if (!existsSync(envPath)) return env;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey.trim();
    if (key && !env[key]) env[key] = parseDotEnvValue(rest.join("="));
  }
  return env;
}

function parseDotEnvValue(value) {
  const withoutComment = value.replace(/\s+#.*$/, "").trim();
  return withoutComment.replace(/^["']|["']$/g, "");
}

function readCliVersion(cliRoot) {
  const packagePath = path.join(cliRoot, "package.json");
  if (!existsSync(packagePath)) return "unknown";
  return JSON.parse(readFileSync(packagePath, "utf8")).version ?? "unknown";
}

function gitCommit(workspace) {
  const child = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: workspace, encoding: "utf8" });
  return child.status === 0 ? child.stdout.trim() : "unknown";
}

function redactConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function summarize(data) {
  if (Array.isArray(data)) return { count: data.length, ids: data.map((item) => item?.id).filter(Boolean).slice(0, 8) };
  if (!data || typeof data !== "object") return data;
  if ("checks" in data) {
    return { backend: data.backend, ok: data.ok, checks: data.checks?.map((check) => `${check.name}:${check.status}`) };
  }
  const result = {};
  for (const key of ["backend", "title", "id", "number", "status", "active", "url", "artifactType", "scopeType", "scopeId"]) {
    if (key in data) result[key] = data[key];
  }
  if ("readiness" in data) result.readiness = data.readiness;
  if ("queueDepth" in data) result.queueDepth = data.queueDepth;
  return result;
}

function parseJson(value) {
  try {
    return JSON.parse(String(value).trim());
  } catch {
    return null;
  }
}

function titleCase(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
