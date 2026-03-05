import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { parseAllResults, aggregateResults } from '../lib/results-parser.js';

export async function reportCommand(options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const resultsDir = resolve(cwd, config.directories.results);

  if (!existsSync(resultsDir)) {
    console.error(chalk.red(`Results directory not found: ${config.directories.results}/`));
    return;
  }

  const results = await parseAllResults(resultsDir);

  if (results.length === 0) {
    console.log(chalk.yellow('No results files found (expected NN-*.md pattern).'));
    return;
  }

  const summary = aggregateResults(results);

  // JSON output
  if (options.json) {
    const output = JSON.stringify(summary, null, 2);
    if (options.output) {
      await writeFile(resolve(cwd, options.output), output + '\n');
      console.log(chalk.green(`JSON report written to ${options.output}`));
    } else {
      console.log(output);
    }
    return;
  }

  // Formatted output
  const lines = [];
  lines.push('');
  lines.push(chalk.bold('  Test Results Summary'));
  lines.push(chalk.gray('  ' + '─'.repeat(60)));
  lines.push('');

  const executed = summary.executed;
  const total = summary.total;
  lines.push(`  Overall: ${chalk.bold(executed)} executed, ${chalk.green(summary.totals.pass + ' PASS')}, ${chalk.red(summary.totals.fail + ' FAIL')}, ${chalk.yellow(summary.totals.blocked + ' BLOCKED')}${summary.totals.pending > 0 ? `, ${chalk.gray(summary.totals.pending + ' PENDING')}` : ''}`);
  lines.push(`  Pass rate: ${chalk.bold(summary.passRate + '%')}`);
  lines.push('');

  // Per-file table
  const header = `  ${'#'.padEnd(4)} ${'Test Plan'.padEnd(35)} ${'Pass'.padStart(5)} ${'Fail'.padStart(5)} ${'Block'.padStart(6)} ${'Pend'.padStart(5)}`;
  lines.push(chalk.gray(header));
  lines.push(chalk.gray('  ' + '─'.repeat(62)));

  for (const r of summary.perFile) {
    const num = r.name.match(/^(\d{2})/)?.[1] || '??';
    const name = r.name.replace(/^\d{2}-/, '').replace(/-/g, ' ');
    const truncName = name.length > 33 ? name.slice(0, 30) + '...' : name;

    const pass = r.counts.pass > 0 ? chalk.green(String(r.counts.pass).padStart(5)) : String(r.counts.pass).padStart(5);
    const fail = r.counts.fail > 0 ? chalk.red(String(r.counts.fail).padStart(5)) : String(r.counts.fail).padStart(5);
    const blocked = r.counts.blocked > 0 ? chalk.yellow(String(r.counts.blocked).padStart(6)) : String(r.counts.blocked).padStart(6);
    const pending = r.counts.pending > 0 ? chalk.gray(String(r.counts.pending).padStart(5)) : String(r.counts.pending).padStart(5);

    lines.push(`  ${num.padEnd(4)} ${truncName.padEnd(35)} ${pass} ${fail} ${blocked} ${pending}`);
  }

  lines.push('');

  if (summary.bugs.length > 0) {
    lines.push(`  Bugs: ${chalk.red(summary.bugs.join(', '))}`);
    lines.push('');
  }

  const output = lines.join('\n');
  console.log(output);

  // Write to file if requested
  if (options.output) {
    // Write a plain-text version (no chalk colors)
    const plainLines = [];
    plainLines.push(`# Test Results Summary`);
    plainLines.push(`Run: ${new Date().toISOString().split('T')[0]}`);
    plainLines.push('');
    plainLines.push(`Overall: ${executed} executed, ${summary.totals.pass} PASS, ${summary.totals.fail} FAIL, ${summary.totals.blocked} BLOCKED${summary.totals.pending > 0 ? `, ${summary.totals.pending} PENDING` : ''}`);
    plainLines.push(`Pass rate: ${summary.passRate}%`);
    plainLines.push('');
    plainLines.push(`| # | Test Plan | Pass | Fail | Blocked | Pending |`);
    plainLines.push(`|---|-----------|------|------|---------|---------|`);

    for (const r of summary.perFile) {
      const num = r.name.match(/^(\d{2})/)?.[1] || '??';
      const name = r.name.replace(/^\d{2}-/, '').replace(/-/g, ' ');
      plainLines.push(`| ${num} | ${name} | ${r.counts.pass} | ${r.counts.fail} | ${r.counts.blocked} | ${r.counts.pending} |`);
    }

    plainLines.push('');
    if (summary.bugs.length > 0) {
      plainLines.push(`Bugs: ${summary.bugs.join(', ')}`);
    }

    await writeFile(resolve(cwd, options.output), plainLines.join('\n') + '\n');
    console.log(chalk.green(`Report written to ${options.output}`));
  }
}
