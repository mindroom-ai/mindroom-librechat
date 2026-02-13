jest.mock(
  'librechat-data-provider',
  () => ({
    CacheKeys: {
      CONFIG_STORE: 'CONFIG_STORE',
      MODELS_CONFIG: 'MODELS_CONFIG',
    },
    Time: {
      TEN_MINUTES: 600000,
    },
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      error: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('~/server/services/Config', () => ({
  loadDefaultModels: jest.fn(),
  loadConfigModels: jest.fn(),
  getAppConfig: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

const { loadDefaultModels, loadConfigModels, getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { CacheKeys } = require('librechat-data-provider');
const { modelController, getModelsConfig, filterModelsByRole } = require('./ModelController');

const createRes = () => {
  const res = {
    send: jest.fn(),
    status: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('ModelController refresh behavior', () => {
  const configStore = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockImplementation((key) => {
      if (key === CacheKeys.CONFIG_STORE) {
        return configStore;
      }
      throw new Error(`Unexpected cache key: ${key}`);
    });
    getAppConfig.mockResolvedValue({});
  });

  test('uses cached models when refresh is not requested', async () => {
    const cachedModels = { openAI: ['cached-model'] };
    configStore.get.mockResolvedValue(cachedModels);

    const req = { query: {} };
    const res = createRes();

    await modelController(req, res);

    expect(configStore.get).toHaveBeenCalledWith(CacheKeys.MODELS_CONFIG);
    expect(loadDefaultModels).not.toHaveBeenCalled();
    expect(loadConfigModels).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(cachedModels);
  });

  test('bypasses cache and reloads models when refresh=true', async () => {
    loadDefaultModels.mockResolvedValue({ openAI: ['fresh-openai'] });
    loadConfigModels.mockResolvedValue({ llama: ['fresh-llama'] });

    const req = { query: { refresh: 'true' } };
    const res = createRes();

    await modelController(req, res);

    expect(loadDefaultModels).toHaveBeenCalledWith(req);
    expect(loadConfigModels).toHaveBeenCalledWith(req);
    expect(configStore.set).toHaveBeenCalledWith(CacheKeys.MODELS_CONFIG, {
      openAI: ['fresh-openai'],
      llama: ['fresh-llama'],
    });
    expect(res.send).toHaveBeenCalledWith({
      openAI: ['fresh-openai'],
      llama: ['fresh-llama'],
    });
  });

  test('treats refresh=1 as force refresh', async () => {
    loadDefaultModels.mockResolvedValue({ openAI: ['fresh-openai'] });
    loadConfigModels.mockResolvedValue({});

    const req = { query: { refresh: '1' } };
    const res = createRes();

    await modelController(req, res);

    expect(loadDefaultModels).toHaveBeenCalledWith(req);
    expect(loadConfigModels).toHaveBeenCalledWith(req);
    expect(res.send).toHaveBeenCalledWith({ openAI: ['fresh-openai'] });
  });
});

describe('filterModelsByRole', () => {
  test('returns allModels unchanged when restrictions is undefined', () => {
    const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    expect(filterModelsByRole(allModels, undefined)).toBe(allModels);
  });

  test('returns allModels unchanged when restrictions is null', () => {
    const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    expect(filterModelsByRole(allModels, null)).toBe(allModels);
  });

  test('filters models for restricted endpoints', () => {
    const allModels = {
      openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'],
      google: ['gemini-pro', 'gemini-ultra'],
    };
    const restrictions = {
      openAI: { models: ['gpt-4o-mini'] },
    };
    const result = filterModelsByRole(allModels, restrictions);
    expect(result.openAI).toEqual(['gpt-4o-mini']);
    expect(result.google).toEqual(['gemini-pro', 'gemini-ultra']);
  });

  test('omits endpoint entirely when models list is empty', () => {
    const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    const restrictions = { openAI: { models: [] } };
    const result = filterModelsByRole(allModels, restrictions);
    expect(result.openAI).toBeUndefined();
  });

  test('excludes models not in the available list', () => {
    const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    const restrictions = { openAI: { models: ['gpt-4o-mini', 'nonexistent'] } };
    const result = filterModelsByRole(allModels, restrictions);
    expect(result.openAI).toEqual(['gpt-4o-mini']);
  });

  test('handles multiple endpoints', () => {
    const allModels = {
      openAI: ['gpt-4o', 'gpt-4o-mini'],
      google: ['gemini-pro'],
      MindRoom: ['mr-pro', 'mr-basic'],
    };
    const restrictions = {
      openAI: { models: ['gpt-4o-mini'] },
      MindRoom: { models: ['mr-basic'] },
    };
    const result = filterModelsByRole(allModels, restrictions);
    expect(result.openAI).toEqual(['gpt-4o-mini']);
    expect(result.google).toEqual(['gemini-pro']);
    expect(result.MindRoom).toEqual(['mr-basic']);
  });
});

describe('getModelsConfig role-based filtering', () => {
  const configStore = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(configStore);
  });

  test('returns role-filtered models from cache', async () => {
    const roleFiltered = { openAI: ['gpt-4o-mini'] };
    configStore.get.mockResolvedValue(roleFiltered);

    const req = { user: { role: 'USER' }, query: {} };
    const result = await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith('MODELS_CONFIG:USER');
    expect(result).toEqual(roleFiltered);
  });

  test('computes and caches role-filtered models on cache miss', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'] };
    // First call for role cache miss, second for base models
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValue({
      _roleModelRestrictions: { openAI: { models: ['gpt-4o-mini'] } },
    });

    const req = { user: { role: 'USER' }, query: {} };
    const result = await getModelsConfig(req);

    expect(result).toEqual({ openAI: ['gpt-4o-mini'] });
    expect(configStore.set).toHaveBeenCalledWith('MODELS_CONFIG:USER', { openAI: ['gpt-4o-mini'] });
  });

  test('returns unfiltered models when no role', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    configStore.get.mockResolvedValue(baseModels);
    getAppConfig.mockResolvedValue({});

    const req = { query: {} };
    const result = await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith(CacheKeys.MODELS_CONFIG);
    expect(result).toEqual(baseModels);
  });

  test('returns unfiltered models when role has no restrictions', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValue({});

    const req = { user: { role: 'ADMIN' }, query: {} };
    const result = await getModelsConfig(req);

    expect(result).toEqual(baseModels);
  });

  test('refresh bypasses per-role cache', async () => {
    const freshModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
    loadDefaultModels.mockResolvedValue(freshModels);
    loadConfigModels.mockResolvedValue({});
    getAppConfig.mockResolvedValue({
      _roleModelRestrictions: { openAI: { models: ['gpt-4o-mini'] } },
    });

    const req = { user: { role: 'USER' }, query: {} };
    const result = await getModelsConfig(req, { refresh: true });

    expect(result).toEqual({ openAI: ['gpt-4o-mini'] });
    expect(loadDefaultModels).toHaveBeenCalled();
  });

  test('different roles get different filtered models', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'] };

    // USER role
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValueOnce({
      _roleModelRestrictions: { openAI: { models: ['gpt-4o-mini'] } },
    });
    const userReq = { user: { role: 'USER' }, query: {} };
    const userResult = await getModelsConfig(userReq);
    expect(userResult).toEqual({ openAI: ['gpt-4o-mini'] });

    // ADMIN role
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValueOnce({});
    const adminReq = { user: { role: 'ADMIN' }, query: {} };
    const adminResult = await getModelsConfig(adminReq);
    expect(adminResult).toEqual(baseModels);
  });

  test('uses base cache key when role is undefined', async () => {
    const models = { openAI: ['gpt-4o'] };
    configStore.get.mockResolvedValue(models);
    getAppConfig.mockResolvedValue({});

    const req = { query: {} };
    await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith(CacheKeys.MODELS_CONFIG);
  });
});

describe('getModelsConfig group-based filtering', () => {
  const configStore = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLogStores.mockReturnValue(configStore);
  });

  test('uses group-based cache key that includes role', async () => {
    const groupFiltered = { openAI: ['gpt-4o-mini'] };
    configStore.get.mockResolvedValue(groupFiltered);

    const req = { user: { role: 'USER', openidGroups: ['group-a', 'group-b'] }, query: {} };
    await getModelsConfig(req);

    // Key includes role and sorted groups as JSON
    expect(configStore.get).toHaveBeenCalledWith('MODELS_CONFIG:g:USER:["group-a","group-b"]');
  });

  test('sorts groups in cache key for consistency', async () => {
    const groupFiltered = { openAI: ['gpt-4o-mini'] };
    configStore.get.mockResolvedValue(groupFiltered);

    const req = { user: { role: 'USER', openidGroups: ['group-b', 'group-a'] }, query: {} };
    await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith('MODELS_CONFIG:g:USER:["group-a","group-b"]');
  });

  test('different roles with same groups get different cache keys', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };

    // USER with groups
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValueOnce({
      _roleModelRestrictions: { openAI: { models: ['gpt-4o-mini'] } },
    });
    const userReq = { user: { role: 'USER', openidGroups: ['group-a'] }, query: {} };
    await getModelsConfig(userReq);

    // ADMIN with same groups
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValueOnce({});
    const adminReq = { user: { role: 'ADMIN', openidGroups: ['group-a'] }, query: {} };
    await getModelsConfig(adminReq);

    const setCalls = configStore.set.mock.calls;
    const userKey = setCalls.find((c) => c[0].includes('USER'));
    const adminKey = setCalls.find((c) => c[0].includes('ADMIN'));
    expect(userKey[0]).not.toEqual(adminKey[0]);
  });

  test('computes and caches group-filtered models on cache miss', async () => {
    const baseModels = { openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'] };
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValue({
      _roleModelRestrictions: { openAI: { models: ['gpt-4o-mini'] } },
    });

    const req = { user: { role: 'USER', openidGroups: ['premium'] }, query: {} };
    const result = await getModelsConfig(req);

    expect(getAppConfig).toHaveBeenCalledWith({ role: 'USER', openidGroups: ['premium'] });
    expect(result).toEqual({ openAI: ['gpt-4o-mini'] });
    expect(configStore.set).toHaveBeenCalledWith(
      'MODELS_CONFIG:g:USER:["premium"]',
      { openAI: ['gpt-4o-mini'] },
      600000,
    );
  });

  test('passes openidGroups to getAppConfig', async () => {
    const baseModels = { openAI: ['gpt-4o'] };
    configStore.get.mockResolvedValueOnce(null).mockResolvedValueOnce(baseModels);
    getAppConfig.mockResolvedValue({});

    const groups = ['alpha', 'beta'];
    const req = { user: { role: 'USER', openidGroups: groups }, query: {} };
    await getModelsConfig(req);

    expect(getAppConfig).toHaveBeenCalledWith({ role: 'USER', openidGroups: groups });
  });

  test('uses role-only key when openidGroups is empty array', async () => {
    const models = { openAI: ['gpt-4o'] };
    configStore.get.mockResolvedValue(models);
    getAppConfig.mockResolvedValue({});

    const req = { user: { role: 'USER', openidGroups: [] }, query: {} };
    await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith('MODELS_CONFIG:USER');
  });

  test('uses role-only key when openidGroups is undefined', async () => {
    const models = { openAI: ['gpt-4o'] };
    configStore.get.mockResolvedValue(models);
    getAppConfig.mockResolvedValue({});

    const req = { user: { role: 'USER' }, query: {} };
    await getModelsConfig(req);

    expect(configStore.get).toHaveBeenCalledWith('MODELS_CONFIG:USER');
  });
});
