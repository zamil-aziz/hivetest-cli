import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';

const STATUS_PATTERN = /PASS|FAIL|BLOCKED|PENDING/i;
const TABLE_ROW_PATTERN = /^\|\s*[\w-]+\s*\|/;

// Match Jira-style ticket refs: only after "Jira:", "→", or in a "Bugs Found" section
const JIRA_REF_PATTERN = /(?:Jira:\s*|→\s*)([A-Z]+-\d+)/g;
const BUGS_SECTION_PATTERN = /^## Bugs Found/i;

/**
 * Parse a single results markdown file.
 * @param {string} content - File content
 * @param {string} filename - File name
 * @param {string} [jiraProject] - Jira project key to filter bug refs (e.g., "HAV")
 * Returns { name, counts: { pass, fail, blocked, pending }, bugs: [] }
 */
export function parseResultsFile(content, filename, jiraProject) {
  const lines = content.split('\n');
  const result = {
    name: filename.replace(/\.md$/, ''),
    counts: { pass: 0, fail: 0, blocked: 0, pending: 0 },
    bugs: [],
    total: 0,
  };

  let inBugsSection = false;

  for (const line of lines) {
    // Track if we're in the "## Bugs Found" section
    if (BUGS_SECTION_PATTERN.test(line)) {
      inBugsSection = true;
      continue;
    }
    if (inBugsSection && line.startsWith('## ')) {
      inBugsSection = false;
    }

    // Extract Jira refs from "Jira: XXX" or "→ XXX" patterns anywhere
    let match;
    const jiraPattern = new RegExp(JIRA_REF_PATTERN.source, 'g');
    while ((match = jiraPattern.exec(line)) !== null) {
      const ref = match[1];
      if (!jiraProject || ref.startsWith(jiraProject + '-')) {
        if (!result.bugs.includes(ref)) {
          result.bugs.push(ref);
        }
      }
    }

    // In bugs section, also match bare ticket refs
    if (inBugsSection) {
      const ticketPattern = jiraProject
        ? new RegExp(`\\b(${jiraProject}-\\d+)\\b`, 'g')
        : /\b([A-Z]{2,}-\d+)\b/g;
      const bareRefs = [...line.matchAll(ticketPattern)].map((m) => m[1]);
      for (const ref of bareRefs) {
        if (!result.bugs.includes(ref)) {
          result.bugs.push(ref);
        }
      }
    }

    // Parse table rows for status counts
    if (!TABLE_ROW_PATTERN.test(line)) continue;

    // Skip the separator row (|---|---|---|---|)
    if (line.includes('---')) continue;

    // Skip the header row
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells[0] === '#' || cells[0] === 'ID') continue;

    // Use column index 2 (0-indexed) for Status in | # | Test Case | Status | Notes |
    // Fall back to scanning all cells if column 2 doesn't contain a status
    const statusCell = (cells.length > 2 && STATUS_PATTERN.test(cells[2]))
      ? cells[2]
      : cells.find((c) => STATUS_PATTERN.test(c));
    if (statusCell) {
      const status = statusCell.match(STATUS_PATTERN)?.[0]?.toLowerCase();
      if (status && result.counts[status] !== undefined) {
        result.counts[status]++;
        result.total++;
      }
    }
  }

  return result;
}

/**
 * Parse all results files in the results directory.
 * Only picks up files matching NN-name.md pattern (ignores HAV-* verification files).
 */
export async function parseAllResults(resultsDir, jiraProject) {
  const files = await readdir(resultsDir);
  const resultFiles = files
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .sort();

  const results = [];
  for (const file of resultFiles) {
    const content = await readFile(resolve(resultsDir, file), 'utf-8');
    results.push(parseResultsFile(content, file, jiraProject));
  }

  return results;
}

/**
 * Aggregate results from multiple parsed files.
 */
export function aggregateResults(results) {
  const totals = { pass: 0, fail: 0, blocked: 0, pending: 0 };
  const allBugs = new Set();

  for (const r of results) {
    totals.pass += r.counts.pass;
    totals.fail += r.counts.fail;
    totals.blocked += r.counts.blocked;
    totals.pending += r.counts.pending;
    for (const bug of r.bugs) {
      allBugs.add(bug);
    }
  }

  const executed = totals.pass + totals.fail + totals.blocked;
  const total = executed + totals.pending;
  const passRate = executed > 0 ? ((totals.pass / executed) * 100).toFixed(1) : '0.0';

  return {
    totals,
    executed,
    total,
    passRate,
    bugs: [...allBugs].sort(),
    perFile: results,
  };
}
