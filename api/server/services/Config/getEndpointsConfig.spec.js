jest.mock(
  'librechat-data-provider',
  () => ({
    CacheKeys: {
      CONFIG_STORE: 'CONFIG_STORE',
      ENDPOINT_CONFIG: 'ENDPOINT_CONFIG',
    },
    EModelEndpoint: {
      openAI: 'openAI',
      google: 'google',
      anthropic: 'anthropic',
      azureOpenAI: 'azureOpenAI',
      azureAssistants: 'azureAssistants',
      assistants: 'assistants',
      agents: 'agents',
      bedrock: 'bedrock',
    },
    Time: {
      TEN_MINUTES: 600000,
    },
    isAgentsEndpoint: jest.fn(() => false),
    orderEndpointsConfig: jest.fn((config) => config),
    defaultAgentCapabilities: [],
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/api',
  () => ({
    loadCustomEndpointsConfig: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('./loadDefaultEConfig', () => jest.fn());
jest.mock('~/cache/getLogStores', () => jest.fn());
jest.mock('./app', () => ({
  getAppConfig: jest.fn(),
}));

const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const { loadCustomEndpointsConfig } = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');
const { getAppConfig } = require('./app');
const { CacheKeys, Time } = require('librechat-data-provider');
const { getEndpointsConfig } = require('./getEndpointsConfig');

describe('getEndpointsConfig', () => {
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(cache);

    cache.get.mockResolvedValue(null);

    loadDefaultEndpointsConfig.mockResolvedValue({
      openAI: { userProvide: false },
      google: { userProvide: false },
    });
    loadCustomEndpointsConfig.mockReturnValue(undefined);
    getAppConfig.mockResolvedValue({
      endpoints: {},
    });
  });

  test('uses a group-scoped cache key with sorted groups and TTL', async () => {
    const req = {
      user: {
        role: 'USER',
        openidGroups: ['group-b', 'group-a'],
      },
    };

    await getEndpointsConfig(req);

    const cacheKey = 'ENDPOINT_CONFIG:g:USER:["group-a","group-b"]';
    expect(cache.get).toHaveBeenCalledWith(cacheKey);
    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      openidGroups: ['group-b', 'group-a'],
    });
    expect(cache.set).toHaveBeenCalledWith(cacheKey, expect.any(Object), Time.TEN_MINUTES);
  });

  test('uses role-only key when openidGroups is empty', async () => {
    const req = {
      user: {
        role: 'USER',
        openidGroups: [],
      },
    };

    await getEndpointsConfig(req);

    expect(cache.get).toHaveBeenCalledWith('ENDPOINT_CONFIG:USER');
    expect(cache.set).toHaveBeenCalledWith('ENDPOINT_CONFIG:USER', expect.any(Object));
  });

  test('returns cached config when present and valid', async () => {
    const cached = { openAI: { userProvide: false } };
    cache.get.mockResolvedValue(cached);

    const req = {
      user: {
        role: 'USER',
      },
    };

    const result = await getEndpointsConfig(req);

    expect(result).toBe(cached);
    expect(getAppConfig).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  test('deletes legacy gptPlugins cache and rebuilds', async () => {
    cache.get.mockResolvedValue({ gptPlugins: true });

    const req = {
      user: {
        role: 'USER',
      },
    };

    await getEndpointsConfig(req);

    expect(cache.delete).toHaveBeenCalledWith('ENDPOINT_CONFIG:USER');
    expect(cache.set).toHaveBeenCalledWith('ENDPOINT_CONFIG:USER', expect.any(Object));
  });

  test('hides endpoints with empty models restriction', async () => {
    getAppConfig.mockResolvedValue({
      endpoints: {},
      _roleModelRestrictions: {
        openAI: { models: [] },
        google: { models: ['gemini-1.5-pro'] },
      },
    });

    const req = {
      user: {
        role: 'USER',
      },
    };

    const result = await getEndpointsConfig(req);

    expect(result.openAI).toBeUndefined();
    expect(result.google).toBeDefined();
  });

  test('uses req.config when available', async () => {
    const req = {
      user: {
        role: 'USER',
        openidGroups: ['group-a'],
      },
      config: {
        endpoints: {},
        _roleModelRestrictions: {
          google: { models: [] },
        },
      },
    };

    const result = await getEndpointsConfig(req);

    expect(getAppConfig).not.toHaveBeenCalled();
    expect(result.google).toBeUndefined();
  });

  test('uses global cache key when no role or groups are present', async () => {
    const req = {};

    await getEndpointsConfig(req);

    expect(cache.get).toHaveBeenCalledWith(CacheKeys.ENDPOINT_CONFIG);
    expect(cache.set).toHaveBeenCalledWith(CacheKeys.ENDPOINT_CONFIG, expect.any(Object));
  });

  test('does not cache scoped entry when using fallback req.config after scoped lookup fails', async () => {
    getAppConfig.mockRejectedValueOnce(new Error('scoped lookup failed'));
    const req = {
      user: {
        role: 'USER',
        openidGroups: ['group-a'],
      },
      config: {
        endpoints: {},
      },
      configIsFallback: true,
    };

    const result = await getEndpointsConfig(req);

    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      openidGroups: ['group-a'],
    });
    expect(result).toEqual(expect.any(Object));
    expect(cache.set).not.toHaveBeenCalled();
  });
});
