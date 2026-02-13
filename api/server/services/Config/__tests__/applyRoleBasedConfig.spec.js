jest.mock('~/server/services/start/tools', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({}),
}));
jest.mock('../loadCustomConfig', () => jest.fn().mockResolvedValue({}));
jest.mock('../getCachedTools', () => ({
  setCachedTools: jest.fn(),
}));
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  }),
);
jest.mock('~/config/paths', () => ({
  structuredTools: '/mock/tools',
}));

const { getAppConfig } = require('../app');
const getLogStores = require('~/cache/getLogStores');

describe('applyRoleBasedConfig', () => {
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    };
    getLogStores.mockReturnValue(mockCache);
  });

  it('should return base config when no roles config exists', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result).toBe(baseConfig);
  });

  it('should return base config when role has no entry', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        premium: {
          endpoints: {
            openAI: { models: ['gpt-4o'] },
          },
        },
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result).toBe(baseConfig);
  });

  it('should return config with role restrictions for matching role', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result._roleModelRestrictions).toEqual({
      openAI: { models: ['gpt-4o-mini'] },
    });
    expect(result).not.toBe(baseConfig);
  });

  it('should flatten custom endpoint restrictions with normalized names', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
            custom: {
              MindRoom: { models: ['mindroom-basic'] },
            },
          },
        },
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result._roleModelRestrictions).toEqual({
      openAI: { models: ['gpt-4o-mini'] },
      MindRoom: { models: ['mindroom-basic'] },
    });
  });

  it('should return cached role config on second call', async () => {
    const cachedRoleConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      _roleModelRestrictions: {
        openAI: { models: ['gpt-4o-mini'] },
      },
    };
    mockCache.get.mockImplementation((key) => {
      if (key === 'USER') {
        return cachedRoleConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result).toBe(cachedRoleConfig);
  });

  it('should return base config for ADMIN with no role entry', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'ADMIN' });

    expect(result).toBe(baseConfig);
    expect(result._roleModelRestrictions).toBeUndefined();
  });

  it('should return base config when role entry has no endpoints', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        USER: {},
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({ role: 'USER' });

    expect(result).toBe(baseConfig);
  });

  it('should return base config when no role is provided', async () => {
    const baseConfig = {
      config: {},
      fileStrategy: 'local',
      imageOutputType: 'png',
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      endpoints: {},
    };
    mockCache.get.mockImplementation((key) => {
      if (key === '_BASE_') {
        return baseConfig;
      }
      return null;
    });

    const result = await getAppConfig({});

    expect(result).toBe(baseConfig);
  });
});
