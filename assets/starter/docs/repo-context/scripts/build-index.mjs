#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const routerDir = path.resolve(scriptDir, "..");
const docsDir = path.resolve(routerDir, "..");
const repoRoot = path.resolve(docsDir, "..");
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
  const rel = pathFromRepo(absPath);
  return rel === "docs/repo-context" || rel.startsWith("docs/repo-context/");
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
const existingFolderLoadWhen = indexExistingFolders(existing);
const contextIndex = buildNode(docsDir, existingFolderLoadWhen);

writeJson(contextIndexPath, contextIndex);
console.log(`wrote ${path.relative(repoRoot, contextIndexPath)}`);
