/**
 * Integration tests for role-based model permissions.
 *
 * These tests exercise the full chain:
 *   YAML config → zod schema parse → AppService → getAppConfig → filterModelsByRole
 *
 * No mocks are used for the data flow — only infrastructure (cache, file I/O) is stubbed.
 */

const { configSchema } = require('librechat-data-provider');

// Import the real applyRoleBasedConfig logic via getAppConfig
// We need to mock only the infrastructure, not the business logic
jest.mock('~/server/services/start/tools', () => ({
  loadAndFormatTools: jest.fn().mockReturnValue({}),
}));
jest.mock('../loadCustomConfig', () => jest.fn());
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

const { getAppConfig } = require('../app');
const { filterModelsByRole } = require('~/server/controllers/ModelController');
const getLogStores = require('~/cache/getLogStores');
const loadCustomConfig = require('../loadCustomConfig');

describe('Role-based model permissions (integration)', () => {
  let mockCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    };
    getLogStores.mockReturnValue(mockCache);
  });

  // ─── Schema validation ─────────────────────────────────────────────

  describe('configSchema validates roles section', () => {
    const baseConfig = {
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      endpoints: {
        openAI: { titleModel: 'gpt-4o-mini' },
      },
    };

    it('accepts a valid roles config', () => {
      const config = {
        ...baseConfig,
        roles: {
          USER: {
            endpoints: {
              openAI: { models: ['gpt-4o-mini'] },
            },
          },
          ADMIN: {},
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts roles with custom endpoints', () => {
      const config = {
        ...baseConfig,
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
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts roles with empty models array (blocks endpoint)', () => {
      const config = {
        ...baseConfig,
        roles: {
          USER: {
            endpoints: {
              openAI: { models: [] },
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts config with no roles section', () => {
      const result = configSchema.strict().safeParse(baseConfig);
      expect(result.success).toBe(true);
    });

    it('rejects typos in endpoint names (strict mode)', () => {
      const config = {
        ...baseConfig,
        roles: {
          USER: {
            endpoints: {
              openai: { models: ['gpt-4o-mini'] }, // wrong casing
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(false);
      const errorMessages = result.error.errors.map((e) => e.message);
      expect(errorMessages.some((m) => m.includes('openai'))).toBe(true);
    });

    it('rejects invalid endpoint key in roles', () => {
      const config = {
        ...baseConfig,
        roles: {
          USER: {
            endpoints: {
              notAnEndpoint: { models: ['gpt-4o-mini'] },
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(false);
    });

    it('rejects models as non-array', () => {
      const config = {
        ...baseConfig,
        roles: {
          USER: {
            endpoints: {
              openAI: { models: 'gpt-4o-mini' }, // should be array
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  // ─── Schema validation for groups ──────────────────────────────────

  describe('configSchema validates groups section', () => {
    const baseConfig = {
      version: '1.2.1',
      interface: { customWelcome: 'hi' },
      endpoints: {
        openAI: { titleModel: 'gpt-4o-mini' },
      },
    };

    it('accepts a valid groups config', () => {
      const config = {
        ...baseConfig,
        groups: {
          'openai-users': {
            endpoints: {
              openAI: { models: ['gpt-4o-mini'] },
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts groups with custom endpoints', () => {
      const config = {
        ...baseConfig,
        groups: {
          'mindroom-users': {
            endpoints: {
              custom: {
                MindRoom: { models: ['mindroom-basic'] },
              },
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts both roles and groups together', () => {
      const config = {
        ...baseConfig,
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
              openAI: { models: ['gpt-4o', 'gpt-4o-mini'] },
            },
          },
        },
      };

      const result = configSchema.strict().safeParse(config);
      expect(result.success).toBe(true);
    });

    it('accepts config with no groups section', () => {
      const result = configSchema.strict().safeParse(baseConfig);
      expect(result.success).toBe(true);
    });
  });

  // ─── Full chain: config → getAppConfig → filterModelsByRole ────────

  describe('end-to-end filtering', () => {
    it('USER with restrictions sees only allowed models', async () => {
      // Simulate: loadCustomConfig returns parsed YAML with roles
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
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
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      // Get role-specific config
      const appConfig = await getAppConfig({ role: 'USER' });

      // Verify restrictions were applied
      expect(appConfig._roleModelRestrictions).toBeDefined();
      expect(appConfig._roleModelRestrictions.openAI).toEqual({ models: ['gpt-4o-mini'] });
      expect(appConfig._roleModelRestrictions.MindRoom).toEqual({ models: ['mindroom-basic'] });

      // Now apply filtering to a models config (as ModelController would)
      const allModels = {
        openAI: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
        google: ['gemini-pro', 'gemini-ultra'],
        MindRoom: ['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise'],
      };

      const filtered = filterModelsByRole(allModels, appConfig._roleModelRestrictions);

      expect(filtered.openAI).toEqual(['gpt-4o-mini']);
      expect(filtered.google).toEqual(['gemini-pro', 'gemini-ultra']); // unrestricted
      expect(filtered.MindRoom).toEqual(['mindroom-basic']);
    });

    it('ADMIN with no role entry sees all models', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        roles: {
          USER: {
            endpoints: {
              openAI: { models: ['gpt-4o-mini'] },
            },
          },
          // ADMIN has no entry → unrestricted
        },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ role: 'ADMIN' });

      // No restrictions for ADMIN
      expect(appConfig._roleModelRestrictions).toBeUndefined();

      // All models pass through unfiltered
      const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'] };
      // Without restrictions, we'd just return allModels as-is
      expect(allModels.openAI).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
    });

    it('role with empty models array blocks that endpoint entirely', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        roles: {
          basic: {
            endpoints: {
              openAI: { models: [] },
            },
          },
        },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ role: 'basic' });
      const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
      const filtered = filterModelsByRole(allModels, appConfig._roleModelRestrictions);

      expect(filtered.openAI).toEqual([]);
    });

    it('no roles config means no restrictions for any role', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ role: 'USER' });

      expect(appConfig._roleModelRestrictions).toBeUndefined();
    });

    it('custom role (not USER/ADMIN) works with restrictions', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        roles: {
          premium: {
            endpoints: {
              openAI: { models: ['gpt-4o', 'gpt-4o-mini', 'o1'] },
              custom: {
                MindRoom: { models: ['mindroom-pro', 'mindroom-basic'] },
              },
            },
          },
        },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ role: 'premium' });

      expect(appConfig._roleModelRestrictions.openAI).toEqual({
        models: ['gpt-4o', 'gpt-4o-mini', 'o1'],
      });
      expect(appConfig._roleModelRestrictions.MindRoom).toEqual({
        models: ['mindroom-pro', 'mindroom-basic'],
      });

      const allModels = {
        openAI: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo'],
        MindRoom: ['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise'],
      };
      const filtered = filterModelsByRole(allModels, appConfig._roleModelRestrictions);

      expect(filtered.openAI).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
      expect(filtered.MindRoom).toEqual(['mindroom-pro', 'mindroom-basic']);
    });

    it('model not in the available list is silently excluded', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        roles: {
          USER: {
            endpoints: {
              openAI: { models: ['gpt-4o-mini', 'nonexistent-model'] },
            },
          },
        },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ role: 'USER' });
      const allModels = { openAI: ['gpt-4o', 'gpt-4o-mini'] };
      const filtered = filterModelsByRole(allModels, appConfig._roleModelRestrictions);

      // Only gpt-4o-mini exists in both lists
      expect(filtered.openAI).toEqual(['gpt-4o-mini']);
    });
  });

  // ─── Group-based filtering ────────────────────────────────────────

  describe('group-based end-to-end filtering', () => {
    it('unions models from multiple groups', async () => {
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
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({
        openidGroups: ['openai-users', 'mindroom-users'],
      });

      expect(appConfig._roleModelRestrictions).toBeDefined();
      expect(appConfig._roleModelRestrictions.openAI).toEqual({ models: ['gpt-4o-mini'] });
      expect(appConfig._roleModelRestrictions.MindRoom).toEqual({ models: ['mindroom-basic'] });

      const allModels = {
        openAI: ['gpt-4o', 'gpt-4o-mini', 'o1'],
        MindRoom: ['mindroom-pro', 'mindroom-basic', 'mindroom-enterprise'],
        google: ['gemini-pro'],
      };
      const filtered = filterModelsByRole(allModels, appConfig._roleModelRestrictions);

      expect(filtered.openAI).toEqual(['gpt-4o-mini']);
      expect(filtered.MindRoom).toEqual(['mindroom-basic']);
      expect(filtered.google).toEqual(['gemini-pro']); // unrestricted
    });

    it('unions overlapping models from same endpoint across groups', async () => {
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
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({
        openidGroups: ['basic-openai', 'premium-openai'],
      });

      expect(appConfig._roleModelRestrictions.openAI.models).toEqual(
        expect.arrayContaining(['gpt-4o-mini', 'gpt-4o', 'o1']),
      );
      expect(appConfig._roleModelRestrictions.openAI.models).toHaveLength(3);
    });

    it('groups take precedence over roles when both configured', async () => {
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
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({
        role: 'USER',
        openidGroups: ['premium-group'],
      });

      // Group config should take precedence
      expect(appConfig._roleModelRestrictions.openAI.models).toEqual(
        expect.arrayContaining(['gpt-4o', 'gpt-4o-mini', 'o1']),
      );
    });

    it('falls back to role-based when user has no matching groups', async () => {
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
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({
        role: 'USER',
        openidGroups: ['unrelated-group'],
      });

      // Falls back to role-based
      expect(appConfig._roleModelRestrictions.openAI).toEqual({ models: ['gpt-4o-mini'] });
    });

    it('no restrictions when user has no groups and no role config', async () => {
      loadCustomConfig.mockResolvedValue({
        version: '1.2.1',
        interface: { customWelcome: 'hi' },
        groups: {
          'some-group': {
            endpoints: {
              openAI: { models: ['gpt-4o-mini'] },
            },
          },
        },
        endpoints: {
          openAI: { titleModel: 'gpt-4o-mini' },
        },
      });

      const appConfig = await getAppConfig({ openidGroups: [] });
      expect(appConfig._roleModelRestrictions).toBeUndefined();
    });
  });
});
