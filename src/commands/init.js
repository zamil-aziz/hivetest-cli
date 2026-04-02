import { writeFile, readFile, mkdir, appendFile } from 'fs/promises';
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
      validate: (v) => (v.startsWith('http://') || v.startsWith('https://')) || 'Must be a valid URL (http:// or https://)',
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
      type: 'password',
      name: 'password',
      message: 'Test account password:',
      mask: '*',
    },
    {
      type: 'input',
      name: 'jiraProjectKey',
      message: 'Jira project key (e.g. HAV):',
    },
  ]);

  // Follow-up Jira configuration when project key is provided
  let jiraConfig = null;
  if (answers.jiraProjectKey?.trim()) {
    const jiraAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'jiraUrl',
        message: 'Jira URL (e.g. https://yourteam.atlassian.net):',
        validate: (v) => v.startsWith('https://') || 'Must be a valid HTTPS URL',
      },
      {
        type: 'input',
        name: 'jiraUsername',
        message: 'Jira username (email):',
        default: answers.email,
      },
      {
        type: 'password',
        name: 'jiraApiToken',
        message: 'Jira API token:',
        mask: '*',
      },
    ]);
    jiraConfig = {
      projectKey: answers.jiraProjectKey.trim().toUpperCase(),
      url: jiraAnswers.jiraUrl.replace(/\/+$/, ''),
      username: jiraAnswers.jiraUsername,
      apiToken: jiraAnswers.jiraApiToken,
    };
  }

  const slug = answers.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

  // Optional database connection
  const { connectDb } = await inquirer.prompt([{
    type: 'confirm',
    name: 'connectDb',
    message: 'Connect a PostgreSQL database? (optional)',
    default: false,
  }]);

  let database = null;
  if (connectDb) {
    const { dsn } = await inquirer.prompt([{
      type: 'input',
      name: 'dsn',
      message: 'PostgreSQL connection string:',
      validate: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://') || 'Must be a PostgreSQL connection string',
    }]);

    const sourceId = slug + '-db';

    // Write dbhub.toml
    const toml = `[[sources]]\nid = "${sourceId}"\ndsn = "${dsn}"\n\n[[tools]]\nname = "execute_sql"\nsource = "${sourceId}"\nreadonly = true\n`;
    await writeFile(resolve(cwd, 'dbhub.toml'), toml);

    database = { sourceId, tomlFile: 'dbhub.toml' };
  }

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
    playwright = {
      command: 'npx',
      args: ['-y', '@playwright/mcp@0.0.68'],
      userDataDirPrefix: `/tmp/hivetest-playwright-${slug}`,
    };
    console.log(chalk.cyan('Added Playwright MCP for browser automation.'));
  } else {
    // Extract Playwright config from imported servers for separate handling
    for (const [name, server] of Object.entries(mcpServers)) {
      if (server.command?.includes('playwright') || server.args?.some((a) => a.includes('playwright'))) {
        playwright = {
          command: server.command,
          args: server.args.filter((a) => !a.includes('user-data-dir')),
          userDataDirPrefix: `/tmp/hivetest-playwright-${slug}`,
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
      passwordEnvVar: 'HIVETEST_PASSWORD',
    },
    models: {
      generate: 'claude-opus-4-6',
      execute: 'claude-sonnet-4-6',
    },
    directories: {
      testPlans: 'testplans',
      results: 'results',
    },
    symlinks: ['CLAUDE.md', 'docs'],
    mcpServers,
  };

  if (jiraConfig) {
    config.jira = { projectKey: jiraConfig.projectKey, url: jiraConfig.url };
  }

  if (playwright) {
    config.playwright = playwright;
  }

  if (database) {
    config.database = database;
  }

  // Write config
  await writeFile(
    getConfigPath(cwd),
    JSON.stringify(config, null, 2) + '\n'
  );

  // Write .env with password and Jira credentials
  let envContent = `HIVETEST_PASSWORD=${answers.password}\n`;
  if (jiraConfig) {
    envContent += `JIRA_USERNAME=${jiraConfig.username}\n`;
    envContent += `JIRA_API_TOKEN=${jiraConfig.apiToken}\n`;
  }
  await writeFile(resolve(cwd, '.env'), envContent);

  // Append .env to .gitignore (create if missing)
  const gitignorePath = resolve(cwd, '.gitignore');
  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    gitignoreContent = await readFile(gitignorePath, 'utf-8');
  }
  for (const entry of ['.env', 'dbhub.toml']) {
    if (!gitignoreContent.split('\n').some((line) => line.trim() === entry)) {
      await appendFile(gitignorePath, `\n${entry}\n`);
      gitignoreContent += `\n${entry}\n`;
    }
  }

  // Create directories
  for (const dir of [config.directories.testPlans, config.directories.results, 'docs']) {
    const dirPath = resolve(cwd, dir);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  console.log(chalk.green('\nCreated hivetest.config.json'));
  console.log(chalk.green('Created .env (password saved, gitignored)'));
  if (database) {
    console.log(chalk.green('Created dbhub.toml (database config, gitignored)'));
  }
  console.log(chalk.green(`Created ${config.directories.testPlans}/, ${config.directories.results}/, and docs/`));
  console.log(chalk.cyan('\nNext steps:'));
  console.log(`  ${chalk.bold('hivetest generate')}  — Opus explores app & generates test plans`);
  console.log(`  ${chalk.bold('hivetest run 01 02')} — Execute plans in parallel`);
}
