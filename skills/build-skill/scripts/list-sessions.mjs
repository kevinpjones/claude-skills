#!/usr/bin/env node
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parseArgs } from 'util';

const { values: flags } = parseArgs({
  options: {
    limit: { type: 'string', short: 'n', default: '20' },
    project: { type: 'string', short: 'p' },
    json: { type: 'boolean', default: false },
    since: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (flags.help) {
  console.log(`Usage: list-sessions.mjs [options]

Browse Claude Code session history across all projects.

Options:
  -n, --limit <N>       Max sessions to show (default: 20, 0 = all)
  -p, --project <name>  Filter by project name (substring match)
      --since <date>    Only sessions modified after this date (ISO or YYYY-MM-DD)
      --json            Output as JSON array
  -h, --help            Show this help
`);
  process.exit(0);
}

const limit = parseInt(flags.limit, 10) || 0;
const projectFilter = flags.project?.toLowerCase();
const sinceDate = flags.since ? new Date(flags.since) : null;

const projectsDir = join(homedir(), '.claude', 'projects');

let projectDirs;
try {
  projectDirs = await readdir(projectsDir);
} catch {
  console.error(`No projects directory found at ${projectsDir}`);
  process.exit(1);
}

const allSessions = [];

for (const dir of projectDirs) {
  const indexPath = join(projectsDir, dir, 'sessions-index.json');
  let indexData;
  try {
    indexData = JSON.parse(await readFile(indexPath, 'utf-8'));
  } catch {
    continue; // No index file for this project
  }

  const projectName = indexData.originalPath
    ? indexData.originalPath.split('/').pop()
    : dir;

  if (projectFilter && !projectName.toLowerCase().includes(projectFilter) && !dir.toLowerCase().includes(projectFilter)) {
    continue;
  }

  for (const entry of indexData.entries || []) {
    const modified = new Date(entry.modified || entry.created);
    if (sinceDate && modified < sinceDate) continue;

    allSessions.push({
      sessionId: entry.sessionId,
      modified: entry.modified || entry.created,
      created: entry.created,
      messageCount: entry.messageCount || 0,
      project: projectName,
      gitBranch: entry.gitBranch || '',
      summary: entry.summary || '',
      firstPrompt: (entry.firstPrompt || '').slice(0, 120),
      fullPath: entry.fullPath,
    });
  }
}

// Sort newest first
allSessions.sort((a, b) => new Date(b.modified) - new Date(a.modified));

const results = limit > 0 ? allSessions.slice(0, limit) : allSessions;

if (flags.json) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

if (results.length === 0) {
  console.log('No sessions found.');
  process.exit(0);
}

// Table output
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const dateFmt = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

console.log(
  `${pad('#', 4)} ${pad('Date', 12)} ${pad('Msgs', 5)} ${pad('Project', 25)} ${pad('Branch', 18)} ${pad('Summary / First Prompt', 50)}`
);
console.log('-'.repeat(118));

results.forEach((s, i) => {
  const label = s.summary || s.firstPrompt || '(no summary)';
  console.log(
    `${pad(i + 1, 4)} ${pad(dateFmt(s.modified), 12)} ${pad(s.messageCount, 5)} ${pad(s.project, 25)} ${pad(s.gitBranch, 18)} ${pad(label, 50)}`
  );
});

console.log(`\n${results.length} of ${allSessions.length} sessions shown. Use --limit 0 to show all.`);
console.log('Use: node extract-session.mjs <session-id> to view a session.');
