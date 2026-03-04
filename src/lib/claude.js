/**
 * Build a claude CLI command string.
 */
export function buildClaudeCommand({ model, prompt, dangerouslySkipPermissions = true }) {
  const parts = ['claude'];

  if (model) {
    parts.push('--model', model);
  }

  if (dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions');
  }

  // Pass the prompt as a positional argument
  parts.push(escapeShellArg(prompt));

  return parts.join(' ');
}

/**
 * Build a claude command that reads the prompt from a file.
 */
export function buildClaudeCommandFromFile({ model, promptFile, dangerouslySkipPermissions = true }) {
  const parts = ['claude'];

  if (model) {
    parts.push('--model', model);
  }

  if (dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions');
  }

  // Read prompt from file using command substitution
  parts.push(`"$(cat ${escapeShellArg(promptFile)})"`)

  return parts.join(' ');
}

function escapeShellArg(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}
