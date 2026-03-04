/**
 * Build an array of arguments for spawning the claude CLI.
 * Returns an array suitable for spawnSync('claude', args).
 */
export function buildClaudeArgs({ model, dangerouslySkipPermissions = true }) {
  const args = [];

  if (model) {
    args.push('--model', model);
  }

  if (dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  return args;
}
