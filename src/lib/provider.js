function shellQuote(str) {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export function getProviderDisplayName(provider = 'claude') {
  return provider === 'codex' ? 'Codex' : 'Claude Code';
}

export function getProviderBinary(provider = 'claude') {
  return provider === 'codex' ? 'codex' : 'claude';
}

export function getDefaultModels(provider = 'claude') {
  if (provider === 'codex') {
    return {
      generate: 'gpt-5.4',
      execute: 'gpt-5.4-mini',
    };
  }

  return {
    generate: 'claude-opus-4-6',
    execute: 'claude-sonnet-4-6',
  };
}

export function buildProviderArgs({ provider = 'claude', model, phase }) {
  const args = [];

  if (model) {
    args.push('--model', model);
  }

  if (provider === 'codex') {
    if (phase === 'generate') {
      args.push('--search');
    }
    args.push('--dangerously-bypass-approvals-and-sandbox');
    return args;
  }

  args.push('--dangerously-skip-permissions');
  return args;
}

export function buildProviderCommand({ provider = 'claude', model, phase, promptFile = '.hivetest-prompt.txt' }) {
  const binary = getProviderBinary(provider);
  const args = buildProviderArgs({ provider, model, phase })
    .map(shellQuote)
    .join(' ');
  const promptExpr = `"$(cat ${shellQuote(promptFile)})"`;

  return `${binary}${args ? ` ${args}` : ''} ${promptExpr}`;
}
