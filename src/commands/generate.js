import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, getPassword, loadDotEnv } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { buildGeneratePrompt } from '../lib/prompts.js';
import {
  buildProviderArgs,
  getProviderBinary,
  getProviderDisplayName,
} from '../lib/provider.js';
import { getRuntimeConfigPath, writeRuntimeConfig } from '../lib/mcp.js';

export async function generateCommand() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  await loadDotEnv(cwd);

  checkPrerequisites(config);

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

  // Build prompt with credentials
  let prompt = buildGeneratePrompt(config);
  prompt += `\n\n## Credentials\n- **Email**: ${config.auth.email}\n- **Password**: ${password}`;

  console.log(chalk.cyan(`Launching ${getProviderDisplayName(config.provider)} (${config.models.generate}) to explore and generate test plans...`));
  console.log(chalk.gray('This is an interactive session — you can observe and intervene.\n'));

  // Write provider runtime config for the session
  const runtimeConfigPath = getRuntimeConfigPath(config.provider, cwd);
  const codexDir = resolve(cwd, '.codex');
  const hadCodexDir = existsSync(codexDir);
  let runtimeBackup = null;

  if (existsSync(runtimeConfigPath)) {
    runtimeBackup = await readFile(runtimeConfigPath, 'utf-8');
  }

  if (config.provider === 'codex') {
    await mkdir(codexDir, { recursive: true });
  }

  await writeRuntimeConfig(cwd, config, 0, undefined, cwd, false, config.models.generate, {
    includeInstructionsFile: false,
  });

  try {
    const args = [
      ...buildProviderArgs({
        provider: config.provider,
        model: config.models.generate,
        phase: 'generate',
      }),
      prompt,
    ];
    const binary = getProviderBinary(config.provider);

    const result = spawnSync(binary, args, { stdio: 'inherit', cwd });

    if (result.status === 130) {
      console.log(chalk.yellow('\nSession interrupted.'));
    } else if (result.status !== 0) {
      console.error(chalk.red(`\n${getProviderDisplayName(config.provider)} exited with code ${result.status}`));
    }
  } finally {
    // Restore or clean up provider runtime config
    if (runtimeBackup !== null) {
      await writeFile(runtimeConfigPath, runtimeBackup);
    } else {
      await unlink(runtimeConfigPath).catch(() => {});
      if (config.provider === 'codex' && !hadCodexDir) {
        await rm(codexDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  console.log(chalk.green('\nGenerate session complete.'));
  console.log(chalk.cyan('Check testplans/ and CLAUDE.md for generated content.'));
}
