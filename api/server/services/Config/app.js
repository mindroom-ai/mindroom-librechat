const { CacheKeys, normalizeEndpointName } = require('librechat-data-provider');
const { logger, AppService } = require('@librechat/data-schemas');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const { setCachedTools } = require('./getCachedTools');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');

const BASE_CONFIG_KEY = '_BASE_';

const loadBaseConfig = async () => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, refresh } = options;

  const cache = getLogStores(CacheKeys.APP_CONFIG);
  const cacheKey = role ? role : BASE_CONFIG_KEY;

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let baseConfig = await cache.get(BASE_CONFIG_KEY);
  if (!baseConfig) {
    logger.info('[getAppConfig] App configuration not initialized. Initializing AppService...');
    baseConfig = await loadBaseConfig();

    if (!baseConfig) {
      throw new Error('Failed to initialize app configuration through AppService.');
    }

    if (baseConfig.availableTools) {
      await setCachedTools(baseConfig.availableTools);
    }

    await cache.set(BASE_CONFIG_KEY, baseConfig);
  }

  if (role) {
    const roleConfig = applyRoleBasedConfig(baseConfig, role);
    if (roleConfig !== baseConfig) {
      await cache.set(cacheKey, roleConfig);
      return roleConfig;
    }
  }

  return baseConfig;
}

/**
 * Apply role-based restrictions to the base config.
 * Returns baseConfig unchanged if the role has no restrictions.
 * @param {AppConfig} baseConfig
 * @param {string} role
 * @returns {AppConfig}
 */
function applyRoleBasedConfig(baseConfig, role) {
  const rolesConfig = baseConfig.roles;
  if (!rolesConfig) {
    return baseConfig;
  }

  const roleEntry = rolesConfig[role];
  if (!roleEntry || !roleEntry.endpoints) {
    return baseConfig;
  }

  const restrictions = {};
  for (const [key, value] of Object.entries(roleEntry.endpoints)) {
    if (key === 'custom' && typeof value === 'object') {
      for (const [customName, customValue] of Object.entries(value)) {
        const normalized = normalizeEndpointName(customName);
        restrictions[normalized] = customValue;
      }
    } else {
      restrictions[key] = value;
    }
  }

  return { ...baseConfig, _roleModelRestrictions: restrictions };
}

/**
 * Clear the app configuration cache
 * @returns {Promise<boolean>}
 */
async function clearAppConfigCache() {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = CacheKeys.APP_CONFIG;
  return await cache.delete(cacheKey);
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
};
