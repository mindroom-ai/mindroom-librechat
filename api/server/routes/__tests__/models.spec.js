/**
 * End-to-end tests for GET /api/models with role and group-based filtering.
 *
 * These tests exercise the full HTTP path:
 *   Express request → auth middleware → ModelController → getModelsConfig → response
 *
 * Infrastructure is mocked (cache, config loading, model sources), but the
 * filtering and caching logic in ModelController and getAppConfig is real.
 */
const express = require('express');
const request = require('supertest');

jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
}));

jest.mock('~/server/services/start/tools', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({}),
}));
jest.mock('~/server/services/Config/loadCustomConfig', () => jest.fn());
jest.mock('~/server/services/Config/getCachedTools', () => ({
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
  root: '/mock/root',
  uploads: '/mock/uploads',
  clientPath: '/mock/client',
  dist: '/mock/dist',
  publicPath: '/mock/public',
  fonts: '/mock/fonts',
  assets: '/mock/assets',
  imageOutput: '/mock/imageOutput',
  pluginManifest: '/mock/pluginManifest',
}));
jest.mock('~/server/services/Config/loadDefaultModels', () =>
  jest.fn().mockResolvedValue({
    openAI: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    google: ['gemini-pro', 'gemini-ultra'],
  }),
);
jest.mock('~/server/services/Config/loadConfigModels', () =>
  jest.fn().mockResolvedValue({
    MindRoom: ['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise'],
  }),
);

const getLogStores = require('~/cache/getLogStores');
const loadCustomConfig = require('~/server/services/Config/loadCustomConfig');

describe('GET /api/models — end-to-end filtering', () => {
  let app;
  let mockUser;
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'test-user', role: 'USER' };
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    };
    getLogStores.mockReturnValue(mockCache);

    // Fresh Express app per test to avoid route/middleware bleed
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = mockUser;
      next();
    });
    // Re-require to get fresh module state
    const modelsRouter = require('../../routes/models');
    app.use('/api/models', modelsRouter);
  });

  it('returns all models when user has no role restrictions and no groups', async () => {
    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body.openAI).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini']);
    expect(res.body.google).toEqual(['gemini-pro', 'gemini-ultra']);
    expect(res.body.MindRoom).toEqual(['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise']);
  });

  it('filters models by role restrictions', async () => {
    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body.openAI).toEqual(['gpt-4o-mini']);
    // Unrestricted endpoints pass through
    expect(res.body.google).toEqual(['gemini-pro', 'gemini-ultra']);
    expect(res.body.MindRoom).toEqual(['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise']);
  });

  it('filters models by group-based restrictions (union of groups)', async () => {
    mockUser.openidGroups = ['openai-users', 'mindroom-users'];

    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      groups: {
        'openai-users': {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
        'mindroom-users': {
          endpoints: {
            custom: {
              MindRoom: { models: ['mindroom-basic'] },
            },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body.openAI).toEqual(['gpt-4o-mini']);
    expect(res.body.MindRoom).toEqual(['mindroom-basic']);
    // Unrestricted endpoint
    expect(res.body.google).toEqual(['gemini-pro', 'gemini-ultra']);
  });

  it('groups take precedence over roles', async () => {
    mockUser.openidGroups = ['premium-group'];

    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      groups: {
        'premium-group': {
          endpoints: {
            openAI: { models: ['gpt-4o', 'gpt-4o-mini', 'o1'] },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    // Group config (3 models), not role config (1 model)
    expect(res.body.openAI).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini', 'o1']));
    expect(res.body.openAI).toHaveLength(3);
  });

  it('falls back to role-based when groups do not match config', async () => {
    mockUser.openidGroups = ['nonexistent-group'];

    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
      },
      groups: {
        'other-group': {
          endpoints: {
            openAI: { models: ['gpt-4o', 'o1'] },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    // Falls back to USER role restriction
    expect(res.body.openAI).toEqual(['gpt-4o-mini']);
  });

  it('two users with same groups but different roles get correct results', async () => {
    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      roles: {
        USER: {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
        // ADMIN has no restrictions
      },
      groups: {
        // No matching groups — forces role fallback
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    // USER with non-matching groups → falls back to USER role
    mockUser.role = 'USER';
    mockUser.openidGroups = ['some-group'];
    const userRes = await request(app).get('/api/models');
    expect(userRes.body.openAI).toEqual(['gpt-4o-mini']);

    // ADMIN with same non-matching groups → falls back to ADMIN (unrestricted)
    mockUser.role = 'ADMIN';
    mockUser.openidGroups = ['some-group'];
    const adminRes = await request(app).get('/api/models');
    expect(adminRes.body.openAI).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini']);
  });

  it('unions overlapping models from multiple groups', async () => {
    mockUser.openidGroups = ['basic-openai', 'premium-openai'];

    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      groups: {
        'basic-openai': {
          endpoints: {
            openAI: { models: ['gpt-4o-mini'] },
          },
        },
        'premium-openai': {
          endpoints: {
            openAI: { models: ['gpt-4o', 'o1'] },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body.openAI).toEqual(expect.arrayContaining(['gpt-4o-mini', 'gpt-4o', 'o1']));
    expect(res.body.openAI).toHaveLength(3);
  });

  it('empty models array blocks the endpoint entirely', async () => {
    loadCustomConfig.mockResolvedValue({
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      roles: {
        USER: {
          endpoints: {
            openAI: { models: [] },
          },
        },
      },
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
    });

    const res = await request(app).get('/api/models');

    expect(res.status).toBe(200);
    expect(res.body.openAI).toBeUndefined();
    // Other endpoints unaffected
    expect(res.body.google).toEqual(['gemini-pro', 'gemini-ultra']);
  });
});
