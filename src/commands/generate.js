import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, getPassword } from '../lib/config.js';
import { checkPrerequisites } from '../lib/prerequisites.js';
import { buildGeneratePrompt } from '../lib/prompts.js';
import { buildClaudeCommandFromFile } from '../lib/claude.js';

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

  // Inject password into prompt
  let prompt = buildGeneratePrompt(config);
  prompt += `\n\n## Credentials\n- **Email**: ${config.auth.email}\n- **Password**: ${password}`;

  // Write prompt to file
  const hivetestDir = resolve(cwd, '.hivetest');
  if (!existsSync(hivetestDir)) {
    await mkdir(hivetestDir, { recursive: true });
  }
  const promptFile = resolve(hivetestDir, 'generate-prompt.txt');
  await writeFile(promptFile, prompt);

  console.log(chalk.cyan(`Launching Claude Code (${config.models.generate}) to explore and generate test plans...`));
  console.log(chalk.gray('This is an interactive session — you can observe and intervene.\n'));

  // Build and execute the command
  const command = buildClaudeCommandFromFile({
    model: config.models.generate,
    promptFile,
  });

  try {
    execSync(command, { stdio: 'inherit', cwd });
  } catch (error) {
    if (error.status === 130) {
      // User interrupted with Ctrl+C
      console.log(chalk.yellow('\nSession interrupted.'));
    } else {
      console.error(chalk.red(`\nClaude Code exited with code ${error.status}`));
    }
  }

  console.log(chalk.green('\nGenerate session complete.'));
  console.log(chalk.cyan('Check testplans/ and CLAUDE.md for generated content.'));
}
