import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, basename } from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getConfigPath, configExists } from '../lib/config.js';

export async function initCommand() {
  const cwd = process.cwd();

  if (configExists(cwd)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'hivetest.config.json already exists. Overwrite?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Detect existing .mcp.json
  let existingMcp = null;
  const mcpPath = resolve(cwd, '.mcp.json');
  if (existsSync(mcpPath)) {
    try {
      existingMcp = JSON.parse(await readFile(mcpPath, 'utf-8'));
      console.log(chalk.cyan('Found existing .mcp.json — will offer to import MCP servers.'));
    } catch {
      // ignore parse errors
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Application name:',
      default: basename(cwd),
    },
    {
      type: 'input',
      name: 'url',
      message: 'Application URL:',
      validate: (v) => v.startsWith('http') || 'Must be a valid URL',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Brief description:',
    },
    {
      type: 'input',
      name: 'email',
      message: 'Test account email:',
    },
    {
      type: 'input',
      name: 'passwordEnvVar',
      message: 'Environment variable name for password:',
      default: 'HIVETEST_PASSWORD',
    },
    {
      type: 'input',
      name: 'jiraProject',
      message: 'Jira project key (leave empty to skip):',
    },
    {
      type: 'input',
      name: 'jiraPrefix',
      message: 'Jira ticket title prefix:',
      when: (a) => a.jiraProject,
      default: (a) => `[${a.name}]`,
    },
    {
      type: 'input',
      name: 'symlinks',
      message: 'Files to symlink into instances (comma-separated):',
      default: 'CLAUDE.md',
      filter: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
    },
    {
      type: 'number',
      name: 'maxInstances',
      message: 'Max parallel instances:',
      default: 3,
    },
  ]);

  // Build MCP servers config
  let mcpServers = {};
  if (existingMcp?.mcpServers) {
    const serverNames = Object.keys(existingMcp.mcpServers);
    const { selectedServers } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedServers',
        message: 'Import MCP servers from .mcp.json:',
        choices: serverNames.map((name) => ({ name, checked: true })),
      },
    ]);
    for (const name of selectedServers) {
      mcpServers[name] = existingMcp.mcpServers[name];
    }
  }

  // Detect if Playwright MCP is already included
  const hasPlaywright = Object.values(mcpServers).some(
    (s) => s.command?.includes('playwright') || s.args?.some((a) => a.includes('playwright'))
  );

  let playwright = null;
  if (!hasPlaywright) {
    const { addPlaywright } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addPlaywright',
        message: 'Add Playwright MCP for browser automation?',
        default: true,
      },
    ]);
    if (addPlaywright) {
      playwright = {
        command: 'npx',
        args: ['-y', '@playwright/mcp'],
        userDataDirPrefix: '/tmp/hivetest-playwright',
      };
    }
  } else {
    // Extract Playwright config from imported servers for separate handling
    for (const [name, server] of Object.entries(mcpServers)) {
      if (server.command?.includes('playwright') || server.args?.some((a) => a.includes('playwright'))) {
        playwright = {
          command: server.command,
          args: server.args.filter((a) => !a.includes('user-data-dir')),
          userDataDirPrefix: '/tmp/hivetest-playwright',
        };
        delete mcpServers[name];
        break;
      }
    }
  }

  const config = {
    name: answers.name,
    url: answers.url,
    description: answers.description,
    auth: {
      email: answers.email,
      passwordEnvVar: answers.passwordEnvVar,
    },
    models: {
      generate: 'claude-opus-4-6',
      execute: 'claude-sonnet-4-6',
    },
    directories: {
      testPlans: 'testplans',
      results: 'results',
    },
    symlinks: answers.symlinks,
    maxInstances: answers.maxInstances,
    mcpServers,
  };

  if (answers.jiraProject) {
    config.jira = {
      project: answers.jiraProject,
      prefix: answers.jiraPrefix,
    };
  }

  if (playwright) {
    config.playwright = playwright;
  }

  // Write config
  await writeFile(
    getConfigPath(cwd),
    JSON.stringify(config, null, 2) + '\n'
  );

  // Create directories
  for (const dir of [config.directories.testPlans, config.directories.results]) {
    const dirPath = resolve(cwd, dir);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  console.log(chalk.green('\nCreated hivetest.config.json'));
  console.log(chalk.green(`Created ${config.directories.testPlans}/ and ${config.directories.results}/`));
  console.log(chalk.cyan('\nNext steps:'));
  console.log(`  ${chalk.bold('hivetest generate')}  — Opus explores app & generates test plans`);
  console.log(`  ${chalk.bold('hivetest run 01 02')} — Execute plans in parallel`);
}
