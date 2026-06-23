#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const decisionArg = process.argv[2];
const routerDir = path.join(repoRoot, "docs", "repo-context");
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

function collectFiles(node, files = []) {
  if (!node || typeof node !== "object") return files;
  if (node.type === "file") files.push({ path: node.path, reason: node.reason ?? null });
  for (const child of node.children ?? []) collectFiles(child, files);
  return files;
}

function readRepoFile(repoPath) {
  const absPath = path.resolve(repoRoot, repoPath);
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`selected path escapes repository: ${repoPath}`);
  }
  return fs.readFileSync(absPath, "utf8");
}

const selectedFiles = collectFiles(decision.selected_tree);
const context = {
  source_decision: path.relative(repoRoot, decisionPath),
  decision_created_at: decision.created_at ?? null,
  prompt_summary: decision.prompt_summary ?? null,
  needs_repo_knowledge: decision.needs_repo_knowledge ?? selectedFiles.length > 0,
  selected_tree: decision.selected_tree ?? null,
  selected_sources: selectedFiles.map((file) => ({
    path: file.path,
    reason: file.reason,
    content: readRepoFile(file.path)
  }))
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`);
pruneDecisionLogs(decisionPath);
pruneContextLogs(outputPath);
console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
