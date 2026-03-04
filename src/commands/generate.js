import { spawnSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, getPassword } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { buildGeneratePrompt } from '../lib/prompts.js';
import { buildClaudeArgs } from '../lib/claude.js';

export async function generateCommand() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  checkPrerequisites();

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

  console.log(chalk.cyan(`Launching Claude Code (${config.models.generate}) to explore and generate test plans...`));
  console.log(chalk.gray('This is an interactive session — you can observe and intervene.\n'));

  // Build args and spawn directly — no shell, no file
  const args = [...buildClaudeArgs({ model: config.models.generate }), prompt];

  const result = spawnSync('claude', args, { stdio: 'inherit', cwd });

  if (result.status === 130) {
    console.log(chalk.yellow('\nSession interrupted.'));
  } else if (result.status !== 0) {
    console.error(chalk.red(`\nClaude Code exited with code ${result.status}`));
  }

  console.log(chalk.green('\nGenerate session complete.'));
  console.log(chalk.cyan('Check testplans/ and CLAUDE.md for generated content.'));
}
