#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { generateCommand } from '../src/commands/generate.js';
import { runCommand } from '../src/commands/run.js';
import { reportCommand } from '../src/commands/report.js';
import { cleanCommand } from '../src/commands/clean.js';
import { testCommand } from '../src/commands/test.js';

const program = new Command();

program
  .name('hivetest')
  .description('QA test orchestrator for Claude Code and Codex')
  .version('0.1.0');

program
  .command('init')
  .description('Create project config (hivetest.config.json)')
  .action(initCommand);

program
  .command('generate')
  .description('Launch the configured generate model to explore the app and write test plans')
  .action(generateCommand);

program
  .command('run')
  .description('Execute test plans in parallel via Terminal.app and the configured provider')
  .argument('[plans...]', 'Plan numbers to execute (e.g., 05 06 07)')
  .option('--max <n>', 'Max parallel instances (overrides config)')
  .option('--headless', 'Run browsers in headless mode')
  .option('--screen <n>', 'Target screen number (1=main, 2=secondary, ...)')
  .action(runCommand);

program
  .command('report')
  .description('Aggregate results from all test plan runs')
  .option('--output <file>', 'Write summary to file')
  .option('--json', 'Output as JSON')
  .action(reportCommand);

program
  .command('test')
  .description('Verify Jira ticket fixes via browser testing')
  .argument('<tickets...>', 'Jira ticket numbers (e.g., 1131 1139)')
  .option('--max <n>', 'Max parallel instances (overrides config)')
  .option('--headless', 'Run browsers in headless mode')
  .option('--screen <n>', 'Target screen number (1=main, 2=secondary, ...)')
  .action(testCommand);

program
  .command('clean')
  .description('Remove instance directories and temp files')
  .option('--force', 'Skip confirmation')
  .action(cleanCommand);

program.parse();
