const mongoose = require('mongoose');
const { CacheKeys, normalizeEndpointName } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
const {
  createAppConfigService,
  clearMcpConfigCache,
  createCodeEnvironmentRegistry,
  mergeAccessibleCodeEnvironments,
  cacheConfig,
  standardCache,
} = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

let codeEnvironmentRegistry;

function getCodeEnvironmentRegistry() {
  if (codeEnvironmentRegistry == null) {
    codeEnvironmentRegistry = createCodeEnvironmentRegistry(mongoose, {
      configurationCache: cacheConfig.USE_REDIS
        ? standardCache('CODE_ENVIRONMENT_CONFIG')
        : undefined,
    });
  }
  return codeEnvironmentRegistry;
}

async function invalidateCodeEnvironmentConfigCache(tenantId) {
  await getCodeEnvironmentRegistry().invalidateAccessibleConfigurations(tenantId);
}

const loadBaseConfig = async (mode) => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig(true, { mode })) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const {
  getAppConfig: getResolvedAppConfig,
  clearAppConfigCache,
  clearOverrideCache,
} = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
  augmentConfig: ({ appConfig, baseConfig, principals, options }) => {
    if (!options.userId) return appConfig;
    return mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig: baseConfig,
      actor: {
        userId: options.userId,
        role: options.role ?? null,
        idOnTheSource: options.idOnTheSource ?? null,
        principals,
      },
      registry: getCodeEnvironmentRegistry(),
    });
  },
});

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {string} [options.userId] - User ID for DB-backed config overrides
 * @param {string} [options.tenantId] - Tenant ID for DB-backed config overrides
 * @param {string[]} [options.openidGroups] - User's IdP groups for group-based config
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @param {boolean} [options.baseOnly] - Return YAML-derived config without role restrictions
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, openidGroups, baseOnly } = options;
  const appConfig = await getResolvedAppConfig(options);

  if (baseOnly) {
    return appConfig;
  }

  // Group-based config takes precedence over role-based config
  if (openidGroups && openidGroups.length > 0) {
    const groupConfig = applyGroupBasedConfig(appConfig, openidGroups);
    if (groupConfig !== appConfig) {
      return groupConfig;
    }
  }

  if (role) {
    return applyRoleBasedConfig(appConfig, role);
  }

  return appConfig;
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
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * and the MCP config-source server cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearMcpConfigCache(),
  ]);
  const labels = [
    'clearAppConfigCache',
    'clearOverrideCache',
    'invalidateCachedTools',
    'clearMcpConfigCache',
  ];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  clearOverrideCache,
  invalidateConfigCaches,
  getCodeEnvironmentRegistry,
  invalidateCodeEnvironmentConfigCache,
};
