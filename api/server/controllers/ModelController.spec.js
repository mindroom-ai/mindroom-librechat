jest.mock(
  'librechat-data-provider',
  () => ({
    CacheKeys: {
      CONFIG_STORE: 'CONFIG_STORE',
      MODELS_CONFIG: 'MODELS_CONFIG',
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
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { CacheKeys } = require('librechat-data-provider');
const { modelController } = require('./ModelController');

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

    expect(configStore.get).not.toHaveBeenCalled();
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

    expect(configStore.get).not.toHaveBeenCalled();
    expect(loadDefaultModels).toHaveBeenCalledWith(req);
    expect(loadConfigModels).toHaveBeenCalledWith(req);
    expect(res.send).toHaveBeenCalledWith({ openAI: ['fresh-openai'] });
  });
});
