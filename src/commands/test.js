import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, getPassword, loadDotEnv } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { createInstance } from '../lib/instances.js';
import { getAllDisplays, calculateWindowLayouts } from '../lib/window-layout.js';
import { buildTestPrompt } from '../lib/prompts.js';
import { buildProviderCommand } from '../lib/provider.js';
import { openWindows, windowsExist, closeWindows } from '../lib/terminal.js';

export async function testCommand(tickets, options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  await loadDotEnv(cwd);

  checkPrerequisites(config);

  if (!config.jira?.projectKey) {
    console.error(chalk.red('Missing jira.projectKey in config. Run "hivetest init" or add it manually.'));
    return;
  }

  // Expand ticket args: numeric → prefixed, hyphenated → as-is
  const ticketIds = tickets.map((t) => {
    if (t.includes('-')) return t.toUpperCase();
    return `${config.jira.projectKey}-${t}`;
  });

  console.log(chalk.cyan(`\nTickets to retest: ${ticketIds.join(', ')}`));

  // Warn if no Jira MCP server available (check both config.jira.url and mcpServers)
  const hasJiraMcp = config.jira?.url || Object.values(config.mcpServers || {}).some(
    (s) =>
      s.command?.includes('jira') ||
      s.args?.some((a) => a.includes('jira')) ||
      s.url?.includes('jira')
  );
  if (!hasJiraMcp) {
    console.warn(chalk.yellow('Warning: No Jira MCP server found in config. The agent may not be able to read tickets.'));
    console.warn(chalk.yellow('Run "hivetest init" and provide Jira URL + credentials to configure it.'));
  } else if (config.jira?.url && (!process.env.JIRA_API_TOKEN || !process.env.JIRA_USERNAME)) {
    console.warn(chalk.yellow('Warning: JIRA_API_TOKEN or JIRA_USERNAME not found in .env. Jira MCP may fail to authenticate.'));
  }

  // Check for existing hivetest test Terminal windows
  if (windowsExist('test')) {
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
    closeWindows(config.playwright?.userDataDirPrefix, [], [], 'test');
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

  // Determine number of instances
  let maxInstances;
  if (options.max !== undefined) {
    maxInstances = parseInt(options.max, 10);
    if (!Number.isInteger(maxInstances) || maxInstances < 1) {
      console.error(chalk.red(`Invalid --max value "${options.max}". Must be a positive integer.`));
      process.exit(1);
    }
  } else {
    maxInstances = config.maxInstances;
  }
  const numInstances = Math.min(maxInstances, ticketIds.length);

  // Distribute tickets across instances
  const ticketAssignments = distributeTickets(ticketIds, numInstances);

  console.log(chalk.cyan(`\nLaunching ${numInstances} instance(s):`));
  for (let i = 0; i < ticketAssignments.length; i++) {
    console.log(chalk.gray(`  Instance ${i + 1}: ${ticketAssignments[i].join(', ')}`));
  }

  // Pick target display: --screen override, else external monitor, else main
  const displays = getAllDisplays();
  let targetDisplay;
  if (options.screen !== undefined) {
    const idx = parseInt(options.screen, 10);
    targetDisplay = displays.find((d) => d.index === idx);
    if (!targetDisplay) {
      console.warn(chalk.yellow(`Screen ${idx} not found. Available: ${displays.map((d) => `${d.index} (${d.name})`).join(', ')}`));
      targetDisplay = displays[0];
    }
  } else {
    targetDisplay = displays.find((d) => !d.isMain) || displays[0];
  }
  console.log(chalk.gray(`Using display: ${targetDisplay.name}${targetDisplay.isMain ? '' : ' (external)'}`));

  // Calculate window layouts
  let browserLayouts, terminalLayouts;
  if (options.headless) {
    // Headless: no browser windows, all grid cells are terminals
    terminalLayouts = calculateWindowLayouts(numInstances, targetDisplay);
    browserLayouts = [];
  } else {
    // Visible: top half = browsers, bottom half = terminals
    const gridLayouts = calculateWindowLayouts(numInstances * 2, targetDisplay);
    browserLayouts = gridLayouts.slice(0, numInstances);
    terminalLayouts = gridLayouts.slice(numInstances);
  }

  // Clean stale Playwright user data dirs to prevent lock file conflicts
  if (config.playwright?.userDataDirPrefix) {
    for (let i = 1; i <= numInstances; i++) {
      const dir = `${config.playwright.userDataDirPrefix}-${i}`;
      if (existsSync(dir)) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }

  // Create instances
  const spinner = ora('Creating instance directories...').start();
  const instances = [];

  for (let i = 0; i < numInstances; i++) {
    const instanceDir = await createInstance(
      cwd,
      config,
      i + 1,
      options.headless ? null : browserLayouts[i],
      'test',
      options.headless,
      config.models.execute
    );
    const prompt = buildTestPrompt(config, ticketAssignments[i]);

    // Write prompt to a file in the instance directory
    const promptFile = resolve(instanceDir, '.hivetest-prompt.txt');
    await writeFile(promptFile, prompt);

    // Build the command string (reads prompt from file)
    const command = buildProviderCommand({
      provider: config.provider,
      model: config.models.execute,
      phase: 'execute',
    });

    instances.push({
      dir: instanceDir,
      command,
      env: { HIVETEST_PASSWORD: password },
    });
  }

  spinner.succeed(`Created ${numInstances} instance(s)`);

  // Open Terminal.app windows
  const termSpinner = ora('Opening Terminal windows...').start();
  const { ttys, windowIds } = openWindows(instances, terminalLayouts, 'test');
  termSpinner.succeed(`Opened ${numInstances} Terminal window(s)`);

  // Save TTYs and window IDs for cleanup
  const hivetestDir = resolve(cwd, '.hivetest');
  await mkdir(hivetestDir, { recursive: true });
  await writeFile(resolve(hivetestDir, 'ttys-test.json'), JSON.stringify(ttys));
  await writeFile(resolve(hivetestDir, 'windowIds-test.json'), JSON.stringify(windowIds));

  console.log(chalk.green('\nAll instances launched.'));
  console.log(chalk.gray(`Testing: ${ticketIds.join(', ')}`));
  console.log(chalk.gray('Results will be written to results/retest-{TICKET}.md'));
  console.log(chalk.gray('"hivetest clean" to close windows and remove instances'));
}

/**
 * Distribute tickets across N instances as evenly as possible.
 * Returns array of arrays.
 */
function distributeTickets(tickets, numInstances) {
  const assignments = Array.from({ length: numInstances }, () => []);
  for (let i = 0; i < tickets.length; i++) {
    assignments[i % numInstances].push(tickets[i]);
  }
  return assignments;
}
