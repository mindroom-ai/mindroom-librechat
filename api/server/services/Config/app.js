const { CacheKeys, normalizeEndpointName } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
const { createAppConfigService, clearMcpConfigCache } = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

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
});

/**
 * Get the app configuration based on user context
 * @param {Object} [options]
 * @param {string} [options.role] - User role for role-based config
 * @param {string} [options.userId] - User ID for DB-backed config overrides
 * @param {string} [options.tenantId] - Tenant ID for DB-backed config overrides
 * @param {boolean} [options.refresh] - Force refresh the cache
 * @param {boolean} [options.baseOnly] - Return YAML-derived config without role restrictions
 * @returns {Promise<AppConfig>}
 */
async function getAppConfig(options = {}) {
  const { role, baseOnly } = options;
  const appConfig = await getResolvedAppConfig(options);

  if (!role || baseOnly) {
    return appConfig;
  }

  return applyRoleBasedConfig(appConfig, role);
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
  invalidateConfigCaches,
};
