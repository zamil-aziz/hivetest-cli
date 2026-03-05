import { readdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, getPassword, loadDotEnv } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { createInstance } from '../lib/instances.js';
import { getScreenResolution, calculateWindowLayouts } from '../lib/window-layout.js';
import { buildExecutePrompt } from '../lib/prompts.js';
import { buildClaudeArgs } from '../lib/claude.js';
import { openWindows, windowsExist, closeWindows } from '../lib/terminal.js';

export async function runCommand(plans, options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  await loadDotEnv(cwd);

  checkPrerequisites();

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
    closeWindows();
  }

  // Resolve plan files
  const testPlansDir = resolve(cwd, config.directories.testPlans);
  const allFiles = await readdir(testPlansDir);
  const planFiles = allFiles.filter((f) => /^\d{2}-.*\.md$/.test(f)).sort();

  if (planFiles.length === 0) {
    console.error(chalk.red(`No test plan files found in ${config.directories.testPlans}/`));
    console.log(chalk.cyan('Run "hivetest generate" to create test plans.'));
    return;
  }

  // Filter to requested plans, or prompt for selection
  let selectedFiles;
  if (plans.length > 0) {
    selectedFiles = [];
    for (const num of plans) {
      const padded = num.padStart(2, '0');
      const match = planFiles.find((f) => f.startsWith(padded));
      if (match) {
        selectedFiles.push(match);
      } else {
        console.warn(chalk.yellow(`No plan file found matching "${num}" (tried ${padded}-*)`));
      }
    }
    if (selectedFiles.length === 0) {
      console.error(chalk.red('No matching plan files found.'));
      return;
    }
  } else {
    // Interactive selection
    const { chosen } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'chosen',
        message: 'Select test plans to execute:',
        choices: planFiles.map((f) => ({ name: f, checked: false })),
        validate: (v) => v.length > 0 || 'Select at least one plan',
      },
    ]);
    selectedFiles = chosen;
  }

  console.log(chalk.cyan(`\nPlans to execute: ${selectedFiles.join(', ')}`));

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

  // Determine number of instances (capped at 4 for 2x2 grid)
  let maxInstances;
  if (options.max !== undefined) {
    maxInstances = parseInt(options.max, 10);
    if (!Number.isInteger(maxInstances) || maxInstances < 1) {
      console.error(chalk.red(`Invalid --max value "${options.max}". Must be a positive integer.`));
      process.exit(1);
    }
    maxInstances = Math.min(maxInstances, 4);
  } else {
    maxInstances = config.maxInstances;
  }
  const numInstances = Math.min(maxInstances, selectedFiles.length);

  // Distribute plans across instances
  const planAssignments = distributePlans(selectedFiles, numInstances);

  console.log(chalk.cyan(`\nLaunching ${numInstances} instance(s):`));
  for (let i = 0; i < planAssignments.length; i++) {
    console.log(chalk.gray(`  Instance ${i + 1}: ${planAssignments[i].join(', ')}`));
  }

  // Calculate window layouts for tiling browser windows
  const { width: screenWidth, height: screenHeight } = getScreenResolution();
  const layouts = calculateWindowLayouts(numInstances, screenWidth, screenHeight);

  // Build claude args (shared across instances)
  const claudeArgs = buildClaudeArgs({ model: config.models.execute });

  // Create instances
  const spinner = ora('Creating instance directories...').start();
  const instances = [];

  for (let i = 0; i < numInstances; i++) {
    const instanceDir = await createInstance(cwd, config, i + 1, layouts[i]);
    const prompt = buildExecutePrompt(config, planAssignments[i]);

    // Write prompt to a file in the instance directory (no password — that goes via env)
    const promptFile = resolve(instanceDir, '.hivetest-prompt.txt');
    await writeFile(promptFile, prompt);

    // Build the command string (reads prompt from file)
    const command = `claude ${claudeArgs.join(' ')} "$(cat .hivetest-prompt.txt)"`;

    instances.push({
      dir: instanceDir,
      command,
      env: { HIVETEST_PASSWORD: password },
    });
  }

  spinner.succeed(`Created ${numInstances} instance(s)`);

  // Open Terminal.app windows
  const termSpinner = ora('Opening Terminal windows...').start();
  openWindows(instances, layouts);
  termSpinner.succeed(`Opened ${numInstances} Terminal window(s)`);

  console.log(chalk.green('\nAll instances launched.'));
  console.log(chalk.gray('Tip: Cmd+Tab to switch between Terminal and browser windows'));
  console.log(chalk.gray('"hivetest clean" to close windows and remove instances'));
}

/**
 * Distribute plan files across N instances as evenly as possible.
 * Returns array of arrays.
 */
function distributePlans(files, numInstances) {
  const assignments = Array.from({ length: numInstances }, () => []);
  for (let i = 0; i < files.length; i++) {
    assignments[i % numInstances].push(files[i]);
  }
  return assignments;
}
