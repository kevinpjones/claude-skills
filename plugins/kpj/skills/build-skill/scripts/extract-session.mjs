#!/usr/bin/env node
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { parseArgs } from 'util';

const { values: flags, positionals } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    'max-text': { type: 'string', default: '2000' },
    'tools-only': { type: 'boolean', default: false },
    'summary-only': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (flags.help || positionals.length === 0) {
  console.log(`Usage: extract-session.mjs <session-id-or-path> [options]

Extract and display a Claude Code session conversation.

Arguments:
  session-id-or-path    A session UUID or path to a .jsonl file

Options:
      --json            Output as JSON array of messages
      --max-text <N>    Max characters per message text (default: 2000, 0 = unlimited)
      --tools-only      Only show tool usage (skip text content)
      --summary-only    Show session summary stats only
  -h, --help            Show this help
`);
  process.exit(flags.help ? 0 : 1);
}

const maxText = parseInt(flags['max-text'], 10) || 0;
const input = positionals[0];

// Resolve the JSONL file path
async function resolveSessionPath(input) {
  // Direct file path
  if (input.endsWith('.jsonl')) return input;

  // Session ID - search across all projects
  const projectsDir = join(homedir(), '.claude', 'projects');
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    console.error(`No projects directory found at ${projectsDir}`);
    process.exit(1);
  }

  for (const dir of projectDirs) {
    const indexPath = join(projectsDir, dir, 'sessions-index.json');
    try {
      const indexData = JSON.parse(await readFile(indexPath, 'utf-8'));
      for (const entry of indexData.entries || []) {
        if (entry.sessionId === input) {
          return entry.fullPath;
        }
      }
    } catch {
      continue;
    }
  }

  // Try the ID as a direct filename pattern
  for (const dir of projectDirs) {
    const candidate = join(projectsDir, dir, `${input}.jsonl`);
    try {
      await readFile(candidate, 'utf-8');
      return candidate;
    } catch {
      continue;
    }
  }

  console.error(`Session not found: ${input}`);
  process.exit(1);
}

const jsonlPath = await resolveSessionPath(input);

// Parse JSONL line by line
const messages = [];
const toolUsages = new Map(); // tool name -> count
let sessionMeta = {};

const rl = createInterface({
  input: createReadStream(jsonlPath),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) continue;

  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }

  // Skip snapshots, progress, and non-message entries
  if (entry.type === 'file-history-snapshot') continue;
  if (entry.type === 'progress') continue;
  if (!entry.message?.role) continue;

  const { role, content } = entry.message;

  // Capture session metadata from first user message
  if (role === 'user' && !sessionMeta.sessionId) {
    sessionMeta = {
      sessionId: entry.sessionId,
      gitBranch: entry.gitBranch,
      cwd: entry.cwd,
      version: entry.version,
      timestamp: entry.timestamp,
    };
  }

  if (role === 'user') {
    // Extract text from user messages
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
    }

    if (!text.trim()) continue;

    messages.push({
      role: 'user',
      text: truncate(text, maxText),
      timestamp: entry.timestamp,
    });
  } else if (role === 'assistant') {
    const contentBlocks = Array.isArray(content) ? content : [];

    // Extract text blocks (skip thinking)
    const textParts = contentBlocks
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .filter(Boolean);

    // Extract tool usage
    const tools = contentBlocks
      .filter(b => b.type === 'tool_use')
      .map(b => {
        const name = b.name;
        toolUsages.set(name, (toolUsages.get(name) || 0) + 1);
        return { name, input: summarizeToolInput(b.input) };
      });

    if (flags['tools-only']) {
      if (tools.length > 0) {
        messages.push({
          role: 'assistant',
          tools,
          timestamp: entry.timestamp,
        });
      }
      continue;
    }

    const text = textParts.join('\n');
    if (!text.trim() && tools.length === 0) continue;

    messages.push({
      role: 'assistant',
      text: truncate(text, maxText),
      tools: tools.length > 0 ? tools : undefined,
      timestamp: entry.timestamp,
    });
  }
}

function truncate(text, max) {
  if (!max || max <= 0 || text.length <= max) return text;
  return text.slice(0, max) + `... [truncated, ${text.length} chars total]`;
}

function summarizeToolInput(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.slice(0, 100);
  // For common tools, show key fields
  if (input.file_path) return input.file_path;
  if (input.command) return input.command.slice(0, 120);
  if (input.pattern) return `pattern: ${input.pattern}`;
  if (input.query) return `query: ${input.query.slice(0, 100)}`;
  if (input.skill) return `skill: ${input.skill}`;
  if (input.prompt) return input.prompt.slice(0, 100);
  if (input.url) return input.url;
  const keys = Object.keys(input);
  return keys.length > 0 ? keys.join(', ') : '';
}

// Output
if (flags['summary-only']) {
  const summary = {
    ...sessionMeta,
    totalMessages: messages.length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length,
    toolUsage: Object.fromEntries([...toolUsages.entries()].sort((a, b) => b[1] - a[1])),
  };
  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Session: ${summary.sessionId}`);
    console.log(`Branch:  ${summary.gitBranch || '(none)'}`);
    console.log(`CWD:     ${summary.cwd || '(unknown)'}`);
    console.log(`Version: ${summary.version || '(unknown)'}`);
    console.log(`Started: ${summary.timestamp || '(unknown)'}`);
    console.log(`Messages: ${summary.totalMessages} (${summary.userMessages} user, ${summary.assistantMessages} assistant)`);
    console.log(`\nTool Usage:`);
    for (const [tool, count] of [...toolUsages.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${tool}: ${count}`);
    }
  }
  process.exit(0);
}

if (flags.json) {
  console.log(JSON.stringify({ session: sessionMeta, messages, toolUsage: Object.fromEntries(toolUsages) }, null, 2));
  process.exit(0);
}

// Human-readable output
console.log(`=== Session: ${sessionMeta.sessionId || '(unknown)'} ===`);
console.log(`Branch: ${sessionMeta.gitBranch || '(none)'}  |  CWD: ${sessionMeta.cwd || '(unknown)'}  |  Started: ${sessionMeta.timestamp || '(unknown)'}`);
console.log('='.repeat(80));

for (const msg of messages) {
  const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const roleLabel = msg.role === 'user' ? 'USER' : 'ASSISTANT';
  console.log(`\n--- ${roleLabel} [${timeStr}] ---`);

  if (msg.text) {
    console.log(msg.text);
  }

  if (msg.tools?.length) {
    for (const t of msg.tools) {
      console.log(`  [tool] ${t.name}: ${t.input}`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log(`Total: ${messages.length} messages | Tools used: ${[...toolUsages.entries()].map(([k, v]) => `${k}(${v})`).join(', ') || 'none'}`);
