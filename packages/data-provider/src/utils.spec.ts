import { EModelEndpoint } from './schemas';
import { KnownEndpoints } from './config';
import {
  normalizeEndpointName,
  normalizeIconURL,
  resolveEndpointIconKey,
  normalizeEndpointIconAliasKey,
} from './utils';

describe('normalizeEndpointName', () => {
  it('normalizes ollama case-insensitively', () => {
    expect(normalizeEndpointName('Ollama')).toBe('ollama');
  });

  it('preserves non-ollama names', () => {
    expect(normalizeEndpointName('Claude')).toBe('Claude');
  });
});

describe('resolveEndpointIconKey', () => {
  it('resolves direct aliases', () => {
    expect(resolveEndpointIconKey('OpenAI')).toBe(EModelEndpoint.openAI);
    expect(resolveEndpointIconKey('claude')).toBe(EModelEndpoint.anthropic);
    expect(resolveEndpointIconKey('together.ai')).toBe(KnownEndpoints['together.ai']);
    expect(resolveEndpointIconKey('Mindroom')).toBe('mindroom');
  });

  it('resolves token-based names when enabled', () => {
    expect(resolveEndpointIconKey('My Claude Gateway', { allowTokenMatch: true })).toBe(
      EModelEndpoint.anthropic,
    );
    expect(resolveEndpointIconKey('Production OpenRouter Endpoint', { allowTokenMatch: true })).toBe(
      KnownEndpoints.openrouter,
    );
  });

  it('does not resolve token-based names when disabled', () => {
    expect(resolveEndpointIconKey('My Claude Gateway')).toBeUndefined();
  });
});

describe('normalizeIconURL', () => {
  it('normalizes icon aliases to canonical icon keys', () => {
    expect(normalizeIconURL('openai')).toBe(EModelEndpoint.openAI);
    expect(normalizeIconURL('CLAUDE')).toBe(EModelEndpoint.anthropic);
  });

  it('keeps custom URL/path values unchanged', () => {
    expect(normalizeIconURL('https://example.com/logo.png')).toBe('https://example.com/logo.png');
    expect(normalizeIconURL('/images/custom-logo.svg')).toBe('/images/custom-logo.svg');
  });
});

describe('normalizeEndpointIconAliasKey', () => {
  it('removes separators and lowercases value', () => {
    expect(normalizeEndpointIconAliasKey('Together.AI Gateway')).toBe('togetheraigateway');
  });
});
