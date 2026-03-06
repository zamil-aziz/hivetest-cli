import { rm } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig } from '../lib/config.js';
import { findInstanceDirs } from '../lib/instances.js';
import { closeWindows } from '../lib/terminal.js';

export async function cleanCommand(options) {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  // Find instance directories
  const instanceDirs = await findInstanceDirs(cwd, config);

  // Find playwright temp dirs
  const playwrightTmpDirs = [];
  if (config.playwright?.userDataDirPrefix) {
    const scanLimit = config.maxInstances;
    for (let i = 0; i <= scanLimit; i++) {
      const dir = `${config.playwright.userDataDirPrefix}-${i}`;
      if (existsSync(dir)) {
        playwrightTmpDirs.push(dir);
      }
    }
  }

  const hivetestDir = resolve(cwd, '.hivetest');
  const hasHivetestDir = existsSync(hivetestDir);

  if (instanceDirs.length === 0 && playwrightTmpDirs.length === 0 && !hasHivetestDir) {
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
  if (hasHivetestDir) {
    console.log(chalk.gray(`  Local temp: ${hivetestDir}`));
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

  // Read stored TTYs and window IDs (titles may have been overwritten by Claude CLI)
  let fallbackTtys = [];
  let fallbackWindowIds = [];
  const ttysFile = resolve(cwd, '.hivetest', 'ttys.json');
  const windowIdsFile = resolve(cwd, '.hivetest', 'windowIds.json');
  if (existsSync(ttysFile)) {
    try { fallbackTtys = JSON.parse(readFileSync(ttysFile, 'utf-8')); } catch {}
  }
  if (existsSync(windowIdsFile)) {
    try { fallbackWindowIds = JSON.parse(readFileSync(windowIdsFile, 'utf-8')); } catch {}
  }

  // Kill browser processes and close Terminal windows
  closeWindows(config.playwright?.userDataDirPrefix, fallbackTtys, fallbackWindowIds);

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
  if (hasHivetestDir) {
    await rm(hivetestDir, { recursive: true, force: true });
    console.log(chalk.green('  Removed .hivetest/'));
  }

  console.log(chalk.green('\nCleanup complete.'));
}
