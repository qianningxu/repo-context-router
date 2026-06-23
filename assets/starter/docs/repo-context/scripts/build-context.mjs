#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const routerDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(routerDir, "..", "..");
const decisionArg = process.argv[2];
const decisionDir = path.join(routerDir, "decisions");
const contextDir = path.join(routerDir, "context");
const keepLatest = 10;

function latestDecisionPath() {
  if (!fs.existsSync(decisionDir)) return null;

  const files = fs
    .readdirSync(decisionDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const latest = files.at(-1);
  return latest ? path.join(decisionDir, latest) : null;
}

function pruneDecisionLogs(activeDecisionPath) {
  if (!fs.existsSync(decisionDir)) return;

  const files = fs
    .readdirSync(decisionDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const stale = files.slice(0, Math.max(0, files.length - keepLatest));
  for (const name of stale) {
    const stalePath = path.join(decisionDir, name);
    if (path.resolve(stalePath) !== path.resolve(activeDecisionPath)) {
      fs.unlinkSync(stalePath);
    }
  }
}

function pruneContextLogs(activeContextPath) {
  if (!fs.existsSync(contextDir)) return;

  const files = fs
    .readdirSync(contextDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const stale = files.slice(0, Math.max(0, files.length - keepLatest));
  for (const name of stale) {
    const stalePath = path.join(contextDir, name);
    if (path.resolve(stalePath) !== path.resolve(activeContextPath)) {
      fs.unlinkSync(stalePath);
    }
  }
}

const resolvedDecisionArg = decisionArg ? path.resolve(repoRoot, decisionArg) : latestDecisionPath();

if (!resolvedDecisionArg) {
  console.log("no context decision found");
  process.exit(0);
}

const decisionPath = resolvedDecisionArg;
const outputPath = path.join(contextDir, path.basename(decisionPath));
const decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));

function readRepoFile(repoPath) {
  const absPath = path.resolve(repoRoot, repoPath);
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`selected path escapes repository: ${repoPath}`);
  }
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, "utf8");
}

function buildContextTree(node) {
  if (!node || typeof node !== "object") return null;

  if (node.type === "file") {
    const content = readRepoFile(node.path);
    return {
      type: "file",
      path: node.path,
      reason: node.reason ?? null,
      content,
      missing: content === null
    };
  }

  return {
    type: "folder",
    path: node.path,
    reason: node.reason ?? null,
    children: (node.children ?? []).map(buildContextTree).filter(Boolean)
  };
}

const contextTree = buildContextTree(decision.selected_tree);
const context = {
  source_decision: path.relative(repoRoot, decisionPath),
  decision_created_at: decision.created_at ?? null,
  prompt: decision.prompt ?? null,
  context_tree: contextTree
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`);
pruneDecisionLogs(decisionPath);
pruneContextLogs(outputPath);
console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
