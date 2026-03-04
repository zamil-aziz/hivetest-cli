import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from '../lib/config.js';
import { findInstanceDirs } from '../lib/instances.js';
import { killSession, sessionExists } from '../lib/tmux.js';

export async function cleanCommand(options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  // Find instance directories
  const instanceDirs = await findInstanceDirs(cwd, config);

  // Find playwright temp dirs
  const playwrightTmpDirs = [];
  if (config.playwright?.userDataDirPrefix) {
    for (let i = 1; i <= 20; i++) {
      const dir = `${config.playwright.userDataDirPrefix}-${i}`;
      if (existsSync(dir)) {
        playwrightTmpDirs.push(dir);
      }
    }
  }

  const hasTmux = sessionExists();

  if (instanceDirs.length === 0 && playwrightTmpDirs.length === 0 && !hasTmux) {
    console.log(chalk.green('Nothing to clean up.'));
    return;
  }

  // Show what will be cleaned
  console.log(chalk.cyan('\nItems to clean:'));
  if (instanceDirs.length > 0) {
    console.log(chalk.gray('  Instance directories:'));
    for (const dir of instanceDirs) {
      console.log(`    ${dir}`);
    }
  }
  if (playwrightTmpDirs.length > 0) {
    console.log(chalk.gray('  Playwright temp directories:'));
    for (const dir of playwrightTmpDirs) {
      console.log(`    ${dir}`);
    }
  }
  if (hasTmux) {
    console.log(chalk.gray('  tmux session: hivetest'));
  }

  // Confirm
  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with cleanup?',
        default: true,
      },
    ]);
    if (!confirm) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Kill tmux session
  if (hasTmux) {
    killSession();
    console.log(chalk.green('  Killed tmux session'));
  }

  // Remove instance directories
  for (const dir of instanceDirs) {
    await rm(dir, { recursive: true, force: true });
    console.log(chalk.green(`  Removed ${dir}`));
  }

  // Remove playwright temp dirs
  for (const dir of playwrightTmpDirs) {
    await rm(dir, { recursive: true, force: true });
    console.log(chalk.green(`  Removed ${dir}`));
  }

  // Remove .hivetest directory
  const hivetestDir = resolve(cwd, '.hivetest');
  if (existsSync(hivetestDir)) {
    await rm(hivetestDir, { recursive: true, force: true });
    console.log(chalk.green('  Removed .hivetest/'));
  }

  console.log(chalk.green('\nCleanup complete.'));
}
