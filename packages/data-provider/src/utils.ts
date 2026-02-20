import { EModelEndpoint } from './schemas';

export const envVarRegex = /^\${(.+)}$/;

/** Extracts the environment variable name from a template literal string */
export function extractVariableName(value: string): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(envVarRegex);
  return match ? match[1] : null;
}

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  if (!value) {
    return value;
  }

  // Trim the input
  const trimmed = value.trim();

  // Special case: if it's just a single environment variable
  const singleMatch = trimmed.match(envVarRegex);
  if (singleMatch) {
    const varName = singleMatch[1];
    return process.env[varName] || trimmed;
  }

  // For multiple variables, process them using a regex loop
  const regex = /\${([^}]+)}/g;
  let result = trimmed;

  // First collect all matches and their positions
  const matches = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    matches.push({
      fullMatch: match[0],
      varName: match[1],
      index: match.index,
    });
  }

  // Process matches in reverse order to avoid position shifts
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, varName, index } = matches[i];
    const envValue = process.env[varName] || fullMatch;

    // Replace at exact position
    result = result.substring(0, index) + envValue + result.substring(index + fullMatch.length);
  }

  return result;
}

/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
export function normalizeEndpointName(name = ''): string {
  return name.toLowerCase() === 'ollama' ? 'ollama' : name;
}

const endpointIconAliases: Record<string, string> = {
  openai: EModelEndpoint.openAI,
  chatgpt: EModelEndpoint.openAI,
  gpt: EModelEndpoint.openAI,
  anthropic: EModelEndpoint.anthropic,
  claude: EModelEndpoint.anthropic,
  claudeai: EModelEndpoint.anthropic,
  google: EModelEndpoint.google,
  gemini: EModelEndpoint.google,
  palm: EModelEndpoint.google,
  palm2: EModelEndpoint.google,
  azureopenai: EModelEndpoint.azureOpenAI,
  bedrock: EModelEndpoint.bedrock,
  awsbedrock: EModelEndpoint.bedrock,
  anyscale: 'anyscale',
  apipie: 'apipie',
  cohere: 'cohere',
  deepseek: 'deepseek',
  fireworks: 'fireworks',
  groq: 'groq',
  helicone: 'helicone',
  huggingface: 'huggingface',
  mistral: 'mistral',
  mlx: 'mlx',
  ollama: 'ollama',
  openrouter: 'openrouter',
  perplexity: 'perplexity',
  qwen: 'qwen',
  shuttleai: 'shuttleai',
  togetherai: 'together.ai',
  unify: 'unify',
  vercel: 'vercel',
  mindroom: 'mindroom',
  xai: 'xai',
  moonshot: 'moonshot',
};

export const normalizeEndpointIconAliasKey = (value = ''): string => {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
};

/**
 * Resolves endpoint/provider names to a canonical icon key.
 *
 * Example: `Claude` => `anthropic`, `OpenAI` => `openAI`, `together.ai` => `together.ai`
 */
export function resolveEndpointIconKey(
  value = '',
  options: {
    allowTokenMatch?: boolean;
  } = {},
): string | undefined {
  if (!value) {
    return;
  }

  const key = normalizeEndpointIconAliasKey(value);
  if (key.length === 0) {
    return;
  }

  const directMatch = endpointIconAliases[key];
  if (directMatch) {
    return directMatch;
  }

  if (!options.allowTokenMatch) {
    return;
  }

  const parts = value.split(/[^a-z0-9.]+/gi).filter(Boolean);
  for (const part of parts) {
    const token = normalizeEndpointIconAliasKey(part);
    const tokenMatch = endpointIconAliases[token];
    if (tokenMatch) {
      return tokenMatch;
    }
  }
}

/**
 * Normalizes iconURL aliases (e.g. "openai", "claude") to canonical icon keys.
 * Keeps URLs/paths unchanged.
 */
export function normalizeIconURL(iconURL?: string | null): string {
  const value = iconURL?.trim() ?? '';
  if (!value) {
    return '';
  }

  return resolveEndpointIconKey(value) ?? value;
}
