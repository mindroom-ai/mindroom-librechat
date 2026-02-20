import { AuthType, EModelEndpoint, ProviderId } from 'librechat-data-provider';
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

  it('brands endpoints whose name contains a provider word', () => {
    const input: TCustomEndpoints = [
      { ...baseEndpoint, name: 'Claude Gateway' },
      { ...baseEndpoint, name: 'MindRoom-Dev' },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['Claude Gateway']).toEqual(
      expect.objectContaining({
        type: EModelEndpoint.custom,
        providerId: ProviderId.anthropic,
      }),
    );
    expect(result?.['Claude Gateway']?.iconURL).toBeUndefined();
    expect(result?.['MindRoom-Dev']?.providerId).toBe(ProviderId.mindroom);
  });

  it('resolves iconURL provider aliases', () => {
    const input: TCustomEndpoints = [
      { ...baseEndpoint, name: 'My Mirror', iconURL: 'openai' },
      { ...baseEndpoint, name: 'Legacy PaLM', iconURL: 'palm2' },
      { ...baseEndpoint, name: 'Claude.ai' },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['My Mirror']?.providerId).toBe(ProviderId.openai);
    expect(result?.['Legacy PaLM']?.providerId).toBe(ProviderId.google);
    expect(result?.['Claude.ai']?.providerId).toBe(ProviderId.anthropic);
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

  it('maps MindRoom and Agents endpoint names to the MindRoom brand', () => {
    const input: TCustomEndpoints = [
      { ...baseEndpoint, name: 'MindRoom' },
      { ...baseEndpoint, name: 'Agents' },
    ];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.MindRoom?.providerId).toBe(ProviderId.mindroom);
    expect(result?.Agents?.providerId).toBe(ProviderId.mindroom);
  });

  it('leaves endpoints without a provider word unbranded', () => {
    const input: TCustomEndpoints = [{ ...baseEndpoint, name: 'Internal Gateway' }];

    const result = loadCustomEndpointsConfig(input);

    expect(result?.['Internal Gateway']?.providerId).toBeUndefined();
  });
});
