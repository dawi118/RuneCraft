const { execFileSync } = require("node:child_process");

const cachedRef = process.env.CACHED_COMMIT_REF;
const commitRef = process.env.COMMIT_REF;
const dataOnlyPaths = [
  "runecraft_site/data/board.json"
];

if (!cachedRef || !commitRef) {
  process.exit(1);
}

let changedFiles = [];
try {
  changedFiles = execFileSync("git", ["diff", "--name-only", cachedRef, commitRef], { encoding: "utf8" })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  process.exit(1);
}

const isDataOnlyChange = changedFiles.length > 0 && changedFiles.every((file) => {
  return dataOnlyPaths.some((path) => file === path || file.startsWith(path));
});

process.exit(isDataOnlyChange ? 0 : 1);
