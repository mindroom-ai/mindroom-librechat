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
 * @param {string[]} [options.openidGroups] - User's IdP groups for group-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, openidGroups, refresh } = options;

  const cache = getLogStores(CacheKeys.APP_CONFIG);
  const cacheKey = role ? role : BASE_CONFIG_KEY;

  // Skip the per-role cache when groups are present — group-based config
  // must be computed fresh (ModelController handles per-group caching).
  if (!refresh && !(openidGroups && openidGroups.length > 0)) {
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

  // Group-based config takes precedence over role-based config
  if (openidGroups && openidGroups.length > 0) {
    const groupConfig = applyGroupBasedConfig(baseConfig, openidGroups);
    if (groupConfig !== baseConfig) {
      // Don't cache per-group-combination in getAppConfig — let ModelController handle caching
      return groupConfig;
    }
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

  const restrictions = flattenEndpointRestrictions(roleEntry.endpoints);
  return { ...baseConfig, _roleModelRestrictions: restrictions };
}

/**
 * Flatten a role/group endpoint config entry into a restrictions map.
 * @param {Object} endpointsEntry
 * @returns {Record<string, { models: string[] }>}
 */
function flattenEndpointRestrictions(endpointsEntry) {
  const restrictions = {};
  for (const [key, value] of Object.entries(endpointsEntry)) {
    if (key === 'custom' && typeof value === 'object') {
      for (const [customName, customValue] of Object.entries(value)) {
        const normalized = normalizeEndpointName(customName);
        restrictions[normalized] = customValue;
      }
    } else {
      restrictions[key] = value;
    }
  }
  return restrictions;
}

/**
 * Apply group-based restrictions by taking the union of all matching groups' permissions.
 * @param {AppConfig} baseConfig
 * @param {string[]} userGroups
 * @returns {AppConfig}
 */
function applyGroupBasedConfig(baseConfig, userGroups) {
  const groupsConfig = baseConfig.groups;
  if (!groupsConfig) {
    return baseConfig;
  }

  const unionRestrictions = {};
  let hasRestrictions = false;

  for (const group of userGroups) {
    const groupEntry = groupsConfig[group];
    if (!groupEntry || !groupEntry.endpoints) {
      continue;
    }
    hasRestrictions = true;
    const groupRestrictions = flattenEndpointRestrictions(groupEntry.endpoints);
    for (const [endpoint, restriction] of Object.entries(groupRestrictions)) {
      if (!unionRestrictions[endpoint]) {
        unionRestrictions[endpoint] = { models: [...restriction.models] };
      } else {
        const existing = new Set(unionRestrictions[endpoint].models);
        for (const model of restriction.models) {
          existing.add(model);
        }
        unionRestrictions[endpoint].models = [...existing];
      }
    }
  }

  if (!hasRestrictions) {
    return baseConfig;
  }

  return { ...baseConfig, _roleModelRestrictions: unionRestrictions };
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
