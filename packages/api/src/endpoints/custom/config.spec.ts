import { EModelEndpoint } from 'librechat-data-provider';
import type { TCustomEndpoints } from 'librechat-data-provider';
import { loadCustomEndpointsConfig } from './config';

describe('loadCustomEndpointsConfig', () => {
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
