import { AuthType, EModelEndpoint } from 'librechat-data-provider';
import type { TCustomEndpoints } from 'librechat-data-provider';
import { loadCustomEndpointsConfig } from './config';

const baseEndpoint = {
  apiKey: 'sk-test',
  baseURL: 'https://gateway.example.com',
  models: { default: ['claude-sonnet-4-5'] },
};

describe('loadCustomEndpointsConfig – native provider param set', () => {
  it('synthesizes defaultParamsEndpoint from provider so the UI shows the right params', () => {
    const config = loadCustomEndpointsConfig([
      { ...baseEndpoint, name: 'Claude-Compatible', provider: EModelEndpoint.anthropic },
    ] as unknown as TCustomEndpoints);

    expect(config?.['Claude-Compatible']?.customParams?.defaultParamsEndpoint).toBe(
      EModelEndpoint.anthropic,
    );
  });

  it('does not set defaultParamsEndpoint for endpoints without a provider', () => {
    const config = loadCustomEndpointsConfig([
      { ...baseEndpoint, name: 'My-LLM' },
    ] as unknown as TCustomEndpoints);

    expect(config?.['My-LLM']?.customParams).toBeUndefined();
  });

  it('respects an explicit non-default defaultParamsEndpoint over the provider', () => {
    const config = loadCustomEndpointsConfig([
      {
        ...baseEndpoint,
        name: 'Claude-Compatible',
        provider: EModelEndpoint.anthropic,
        customParams: { defaultParamsEndpoint: EModelEndpoint.google },
      },
    ] as unknown as TCustomEndpoints);

    expect(config?.['Claude-Compatible']?.customParams?.defaultParamsEndpoint).toBe(
      EModelEndpoint.google,
    );
  });
});

describe('loadCustomEndpointsConfig – user credential prompts', () => {
  it('requires a user key when the custom base URL is user-provided', () => {
    const config = loadCustomEndpointsConfig([
      { ...baseEndpoint, name: 'User URL', baseURL: AuthType.USER_PROVIDED },
    ] as unknown as TCustomEndpoints);

    expect(config?.['User URL']).toEqual(
      expect.objectContaining({
        userProvide: true,
        userProvideURL: true,
      }),
    );
  });

  it('requires a user key when the custom API key is user-provided', () => {
    const config = loadCustomEndpointsConfig([
      { ...baseEndpoint, name: 'User Key', apiKey: AuthType.USER_PROVIDED },
    ] as unknown as TCustomEndpoints);

    expect(config?.['User Key']).toEqual(
      expect.objectContaining({
        userProvide: true,
        userProvideURL: false,
      }),
    );
  });

  it('does not require a user key for admin-trusted credentials and base URL', () => {
    const config = loadCustomEndpointsConfig([
      { ...baseEndpoint, name: 'Admin Trusted' },
    ] as unknown as TCustomEndpoints);

    expect(config?.['Admin Trusted']).toEqual(
      expect.objectContaining({
        userProvide: false,
        userProvideURL: false,
      }),
    );
  });
});

describe('loadCustomEndpointsConfig – endpoint logos', () => {
  const baseEndpoint = {
    apiKey: 'test-key',
    baseURL: 'https://example.com/v1',
    models: {
      default: ['model-a'],
      fetch: false,
    },
  };

  it('infers anthropic icon for Claude-like endpoint names', () => {
    const input: TCustomEndpoints = [
      {
        ...baseEndpoint,
        name: 'Claude Gateway',
      },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['Claude Gateway']).toEqual(
      expect.objectContaining({
        type: EModelEndpoint.custom,
        iconURL: EModelEndpoint.anthropic,
      }),
    );
  });

  it('normalizes iconURL aliases to canonical keys', () => {
    const input: TCustomEndpoints = [
      {
        ...baseEndpoint,
        name: 'OpenAI Mirror',
        iconURL: 'openai',
      },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['OpenAI Mirror']?.iconURL).toBe(EModelEndpoint.openAI);
  });

  it('preserves explicit custom icon URLs', () => {
    const input: TCustomEndpoints = [
      {
        ...baseEndpoint,
        name: 'Custom Endpoint',
        iconURL: 'https://cdn.example.com/custom-logo.png',
      },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['Custom Endpoint']?.iconURL).toBe('https://cdn.example.com/custom-logo.png');
  });

  it('maps Mindroom and Agents endpoint names to the Mindroom logo key', () => {
    const input: TCustomEndpoints = [
      {
        ...baseEndpoint,
        name: 'Mindroom',
      },
      {
        ...baseEndpoint,
        name: 'Agents',
      },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.Mindroom?.iconURL).toBe('mindroom');
    expect(result?.Agents?.iconURL).toBe('mindroom');
  });
});
