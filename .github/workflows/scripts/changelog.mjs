#!/usr/bin/env node
// Collates changelog.d/ fragments into CHANGELOG.md at release time.
//
//   node changelog.mjs collect [--bump|--files]   inspect the pending fragments
//   node changelog.mjs release <ver> <date>       write them as a version section
//
// Branches add one fragment each and never touch CHANGELOG.md, so concurrent
// feature branches cannot conflict on it. See changelog.d/README.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const FILE = "CHANGELOG.md";
const DIR = "changelog.d";
const HISTORY_MARKER = "## Full changelog history";
const IGNORED = new Set(["README.md", ".gitkeep"]);
const BUMPS = ["patch", "minor", "major"];
const SECTION_ORDER = ["Added", "Changed", "Fixed", "Removed", "Security"];

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

// Yields merge order only because feature PRs are squash-merged into staging;
// with merge commits it would yield authoring order instead.
function mergeOrder() {
  const out = execFileSync(
    "git",
    [
      "log",
      "--reverse",
      "--diff-filter=A",
      "--name-only",
      "--format=",
      "--",
      `${DIR}/`,
    ],
    { encoding: "utf8" },
  );
  const lines = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // A deleted-then-re-added fragment lists two adds; the re-add is its order.
  return [...new Set(lines.reverse())].reverse();
}

function fragmentPaths() {
  if (!existsSync(DIR)) return [];
  const present = new Set(
    readdirSync(DIR)
      .filter((name) => name.endsWith(".md") && !IGNORED.has(name))
      .map((name) => `${DIR}/${name}`),
  );
  const ordered = mergeOrder().filter((path) => present.has(path));
  const untracked = [...present]
    .filter((path) => !ordered.includes(path))
    .sort();
  return [...ordered, ...untracked];
}

function trimBlanks(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function parseFragment(path) {
  const text = readFileSync(path, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/);

  let bump = "patch";
  if (frontmatter) {
    const declared = frontmatter[1].match(/^bump:(.*)$/m);
    if (declared) {
      const value = declared[1].trim();
      bump = value.toLowerCase();
      if (!BUMPS.includes(bump)) {
        fail(
          `${path}: invalid bump '${value}' (expected patch, minor or major)`,
        );
      }
    }
  }

  const body = frontmatter ? text.slice(frontmatter[0].length) : text;
  const sections = new Map();
  let current = null;
  for (const line of body.split("\n")) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
    else if (line.trim())
      fail(`${path}: content outside a '### Section' heading: ${line.trim()}`);
  }

  if (sections.size === 0) fail(`${path}: no '### Section' headings found`);

  for (const [name, lines] of sections) {
    const trimmed = trimBlanks(lines);
    if (trimmed.length === 0) fail(`${path}: '### ${name}' is empty`);
    sections.set(name, trimmed);
  }

  return { bump, sections };
}

function rank(name) {
  const index = SECTION_ORDER.indexOf(name);
  return index === -1 ? SECTION_ORDER.length : index;
}

function collect() {
  const files = fragmentPaths();
  const merged = new Map();
  let bump = "patch";

  for (const path of files) {
    const fragment = parseFragment(path);
    if (BUMPS.indexOf(fragment.bump) > BUMPS.indexOf(bump))
      bump = fragment.bump;
    for (const [name, lines] of fragment.sections) {
      if (!merged.has(name)) merged.set(name, []);
      merged.get(name).push(...lines);
    }
  }

  const markdown = [...merged.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((name) => `### ${name}\n\n${merged.get(name).join("\n")}`)
    .join("\n\n");

  return { files, bump, markdown };
}

function release(version, date) {
  if (!version || !date) fail("usage: changelog.mjs release <version> <date>");

  const { markdown } = collect();
  if (!markdown) fail(`nothing to release: no fragments in ${DIR}/`);

  const text = readFileSync(FILE, "utf8");
  const marker = new RegExp(`^${HISTORY_MARKER}$`, "m");
  if (!marker.test(text))
    fail(`${FILE} is missing the '${HISTORY_MARKER}' marker`);

  const section = `${HISTORY_MARKER}\n\n## [${version}] – ${date}\n\n${markdown}`;
  writeFileSync(
    FILE,
    text.replace(marker, () => section),
  );
  console.log(`Wrote ## [${version}] – ${date} from ${DIR}/.`);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "collect") {
  const result = collect();
  if (rest.includes("--bump")) console.log(result.bump);
  else if (rest.includes("--files")) console.log(result.files.join("\n"));
  else console.log(result.markdown);
} else if (mode === "release") {
  release(rest[0], rest[1]);
} else {
  fail(`unknown mode '${mode ?? ""}' (expected 'collect' or 'release')`);
}
