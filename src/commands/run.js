import { readdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { loadConfig, getPassword } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { createInstance } from '../lib/instances.js';
import { buildExecutePrompt } from '../lib/prompts.js';
import { buildClaudeCommandFromFile } from '../lib/claude.js';
import { createSession, attachSession, sessionExists, killSession } from '../lib/tmux.js';

export async function runCommand(plans, options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  checkPrerequisites({ needTmux: true });

  // Check for existing tmux session
  if (sessionExists()) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'A hivetest tmux session already exists.',
        choices: [
          { name: 'Kill it and start fresh', value: 'kill' },
          { name: 'Attach to existing session', value: 'attach' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);
    if (action === 'cancel') return;
    if (action === 'attach') {
      attachSession();
      return;
    }
    killSession();
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

  // Determine number of instances
  let maxInstances = options.max
    ? parseInt(options.max, 10)
    : config.maxInstances;
  if (isNaN(maxInstances)) {
    console.warn(chalk.yellow(`Invalid --max value "${options.max}", using config default (${config.maxInstances})`));
    maxInstances = config.maxInstances;
  }
  const numInstances = Math.min(maxInstances, selectedFiles.length);

  // Distribute plans across instances
  const planAssignments = distributePlans(selectedFiles, numInstances);

  console.log(chalk.cyan(`\nLaunching ${numInstances} instance(s):`));
  for (let i = 0; i < planAssignments.length; i++) {
    console.log(chalk.gray(`  Instance ${i + 1}: ${planAssignments[i].join(', ')}`));
  }

  // Create instances
  const spinner = ora('Creating instance directories...').start();
  const instances = [];

  for (let i = 0; i < numInstances; i++) {
    const instanceDir = await createInstance(cwd, config, i + 1);
    const prompt = buildExecutePrompt(config, planAssignments[i], password);

    // Write prompt to a file in the instance directory
    const promptFile = resolve(instanceDir, '.hivetest-prompt.txt');
    await writeFile(promptFile, prompt);

    const command = buildClaudeCommandFromFile({
      model: config.models.execute,
      promptFile: '.hivetest-prompt.txt',
    });

    instances.push({ dir: instanceDir, command });
  }

  spinner.succeed(`Created ${numInstances} instance(s)`);

  // Launch tmux session
  const tmuxSpinner = ora('Starting tmux session...').start();
  createSession(instances);
  tmuxSpinner.succeed('tmux session ready');

  console.log(chalk.green('\nAttaching to tmux session...'));
  console.log(chalk.gray('Tip: Ctrl+B then D to detach, "hivetest clean" to remove instances'));

  // Attach to tmux
  attachSession();
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
