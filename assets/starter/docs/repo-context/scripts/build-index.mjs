#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsDir = path.join(repoRoot, "docs");
const routerDir = path.join(docsDir, "repo-context");
const contextIndexPath = path.join(routerDir, "context.index.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function pathFromRepo(absPath) {
  return toPosix(path.relative(repoRoot, absPath));
}

function extractLoadWhen(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const frontmatter = match[1];
  const quoted = frontmatter.match(/^load_when:\s*["']([\s\S]*?)["']\s*$/m);
  if (quoted) return quoted[1].trim();

  const plain = frontmatter.match(/^load_when:\s*(.+?)\s*$/m);
  return plain ? plain[1].trim() : null;
}

function indexExistingFolders(node, map = new Map()) {
  if (!node || typeof node !== "object") return map;
  if (node.type === "folder") map.set(node.path, node.load_when ?? null);
  for (const child of node.children ?? []) indexExistingFolders(child, map);
  return map;
}

function shouldSkip(absPath) {
  const name = path.basename(absPath);
  if (name === "repo-context") return true;
  return false;
}

function buildNode(absDir, existingFolderLoadWhen) {
  const node = {
    type: "folder",
    path: pathFromRepo(absDir),
    load_when: existingFolderLoadWhen.get(pathFromRepo(absDir)) ?? null,
    children: []
  };

  const entries = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (shouldSkip(absPath)) continue;

    if (entry.isDirectory()) {
      node.children.push(buildNode(absPath, existingFolderLoadWhen));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      node.children.push({
        type: "file",
        path: pathFromRepo(absPath),
        load_when: extractLoadWhen(absPath)
      });
    }
  }

  return node;
}

if (!fs.existsSync(docsDir)) {
  throw new Error("docs/ directory does not exist");
}

const existing = readJson(contextIndexPath);
const existingFolderLoadWhen = indexExistingFolders(existing?.tree);

const contextIndex = {
  root: "docs",
  path: "docs/repo-context/context.index.json",
  generated_from: {
    documents: "docs/**/*.md frontmatter",
    default_folder_load_when: null
  },
  routing_contract: {
    purpose: "Use this compiled index to decide which repository knowledge sources should be loaded for a prompt.",
    load_when: "Natural-language condition for when this node should be selected.",
    folder_default: "Folder load_when values are edited only in this JSON index and default to null until configured manually.",
    selection_rule: "Select the smallest set of matching documents. Use folder nodes to narrow the search space, then select specific child documents.",
    decision_log: {
      directory: "docs/repo-context/decisions",
      keep_latest: 10
    },
    context_output: "docs/repo-context/context/<decision-filename>.json"
  },
  tree: buildNode(docsDir, existingFolderLoadWhen)
};

writeJson(contextIndexPath, contextIndex);
console.log(`wrote ${path.relative(repoRoot, contextIndexPath)}`);
