import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, getPassword, loadDotEnv } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { createInstance } from '../lib/instances.js';
import { getScreenResolution, calculateWindowLayouts } from '../lib/window-layout.js';
import { buildTestPrompt } from '../lib/prompts.js';
import { buildClaudeArgs } from '../lib/claude.js';
import { openWindows, windowsExist, closeWindows } from '../lib/terminal.js';

export async function testCommand(tickets) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  await loadDotEnv(cwd);

  checkPrerequisites();

  // Validate jira.projectKey
  if (!config.jira?.projectKey) {
    console.error(chalk.red('Missing jira.projectKey in hivetest.config.json'));
    console.log(chalk.cyan('Add it to your config:'));
    console.log(chalk.gray('  "jira": { "projectKey": "HAV" }'));
    console.log(chalk.cyan('Or re-run "hivetest init" to set it up.'));
    return;
  }

  // Expand ticket args: numeric → prefixed, hyphenated → as-is
  const ticketIds = tickets.map((t) => {
    if (t.includes('-')) return t.toUpperCase();
    return `${config.jira.projectKey}-${t}`;
  });

  console.log(chalk.cyan(`\nTickets to retest: ${ticketIds.join(', ')}`));

  // Warn if no Jira MCP server found
  const hasJiraMcp = Object.values(config.mcpServers || {}).some(
    (s) =>
      s.command?.includes('jira') ||
      s.args?.some((a) => a.includes('jira')) ||
      s.url?.includes('jira')
  );
  if (!hasJiraMcp) {
    console.warn(chalk.yellow('Warning: No Jira MCP server found in config. The agent may not be able to read tickets.'));
  }

  // Check for existing hivetest Terminal windows
  if (windowsExist()) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Hivetest Terminal windows already exist.',
        choices: [
          { name: 'Close and start fresh', value: 'close' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);
    if (action === 'cancel') return;
    closeWindows(config.playwright?.userDataDirPrefix);
  }

  // Get password
  let password = getPassword(config);
  if (!password) {
    const { pw } = await inquirer.prompt([
      {
        type: 'password',
        name: 'pw',
        message: `Enter password (${config.auth.passwordEnvVar} not set):`,
        mask: '*',
      },
    ]);
    password = pw;
  }

  // Single window layout
  const { width: screenWidth, height: screenHeight } = getScreenResolution();
  const layouts = calculateWindowLayouts(1, screenWidth, screenHeight);

  // Clean stale Playwright user data dir for index 1
  if (config.playwright?.userDataDirPrefix) {
    const dir = `${config.playwright.userDataDirPrefix}-1`;
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // Create instance
  const spinner = ora('Creating instance directory...').start();
  const instanceDir = await createInstance(cwd, config, 1, layouts[0]);
  const prompt = buildTestPrompt(config, ticketIds);

  // Write prompt file
  const promptFile = resolve(instanceDir, '.hivetest-prompt.txt');
  await writeFile(promptFile, prompt);

  // Build claude command
  const claudeArgs = buildClaudeArgs({ model: config.models.execute });
  const command = `claude ${claudeArgs.join(' ')} "$(cat .hivetest-prompt.txt)"`;

  spinner.succeed('Created instance directory');

  // Open Terminal window
  const termSpinner = ora('Opening Terminal window...').start();
  const { ttys, windowIds } = openWindows(
    [{ dir: instanceDir, command, env: { HIVETEST_PASSWORD: password } }],
    layouts
  );
  termSpinner.succeed('Opened Terminal window');

  // Save TTYs and window IDs for cleanup
  const hivetestDir = resolve(cwd, '.hivetest');
  await mkdir(hivetestDir, { recursive: true });
  await writeFile(resolve(hivetestDir, 'ttys.json'), JSON.stringify(ttys));
  await writeFile(resolve(hivetestDir, 'windowIds.json'), JSON.stringify(windowIds));

  console.log(chalk.green('\nRetest instance launched.'));
  console.log(chalk.gray(`Testing: ${ticketIds.join(', ')}`));
  console.log(chalk.gray('Results will be written to results/retest-{TICKET}.md'));
  console.log(chalk.gray('"hivetest clean" to close windows and remove instances'));
}
