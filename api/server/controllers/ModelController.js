const { logger, getTenantId, SYSTEM_TENANT_ID } = require('@librechat/data-schemas');
const { CacheKeys, Time } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels, getAppConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

/**
 * Filter a models config by the role's allowed models.
 * If restrictions is nullish, returns allModels unmodified.
 * @param {TModelsConfig} allModels
 * @param {Record<string, { models: string[] }> | undefined} restrictions
 * @returns {TModelsConfig}
 */
function filterModelsByRole(allModels, restrictions) {
  if (!restrictions) {
    return allModels;
  }

  const filtered = {};
  for (const [endpoint, models] of Object.entries(allModels)) {
    if (restrictions[endpoint]) {
      const allowed = new Set(restrictions[endpoint].models);
      const result = models.filter((m) => allowed.has(m));
      // Omit endpoints with zero allowed models so the UI hides them entirely
      if (result.length > 0) {
        filtered[endpoint] = result;
      }
    } else {
      filtered[endpoint] = models;
    }
  }
  return filtered;
}

/**
 * Tenant that scopes YAML custom endpoints for this request, resolved like `getAppConfig`:
 * an ambient tenant context wins over the user's stored tenant.
 * @param {ServerRequest} req
 * @returns {string | undefined}
 */
function getModelsTenantId(req) {
  const ambientTenantId = getTenantId();
  if (ambientTenantId && ambientTenantId !== SYSTEM_TENANT_ID) {
    return ambientTenantId;
  }
  const tenantId = req?.user?.tenantId;
  return tenantId && tenantId !== SYSTEM_TENANT_ID ? tenantId : undefined;
}

/**
 * Cache key for the unfiltered models config, scoped by tenant.
 * @param {string} [tenantId]
 * @returns {string}
 */
function getBaseModelsCacheKey(tenantId) {
  return tenantId ? `${CacheKeys.MODELS_CONFIG}:t:${tenantId}` : CacheKeys.MODELS_CONFIG;
}

/**
 * Build a cache key for the models config based on tenant, role and/or groups.
 * @param {string} [role]
 * @param {string[]} [openidGroups]
 * @param {string} [tenantId]
 * @returns {string}
 */
function getModelsCacheKey(role, openidGroups, tenantId) {
  const baseKey = getBaseModelsCacheKey(tenantId);
  if (openidGroups && openidGroups.length > 0) {
    // JSON.stringify handles group names that contain commas or special chars
    const groupsPart = JSON.stringify([...openidGroups].sort());
    // Include role because getAppConfig may fall back to role-based restrictions
    // when none of the user's groups match the config
    const rolePart = role || '_';
    return `${baseKey}:g:${rolePart}:${groupsPart}`;
  }
  return role ? `${baseKey}:${role}` : baseKey;
}

/**
 * Load the base (unfiltered) models from default + custom config sources.
 * @param {ServerRequest} req
 * @param {Object} [options]
 * @param {boolean} [options.refresh=false] - Force-refresh models instead of reading cached config.
 * @returns {Promise<TModelsConfig>}
 */
async function loadBaseModels(req, options = {}) {
  const { refresh = false } = options;
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = getBaseModelsCacheKey(getModelsTenantId(req));
  if (!refresh) {
    const cachedModelsConfig = await cache.get(cacheKey);
    if (cachedModelsConfig) {
      return cachedModelsConfig;
    }
  }

  const [defaultModelsConfig, customModelsConfig] = await Promise.all([
    loadDefaultModels(req),
    loadConfigModels(req),
  ]);

  const modelConfig = { ...defaultModelsConfig, ...customModelsConfig };

  await cache.set(cacheKey, modelConfig);
  return modelConfig;
}

/**
 * Get models config, filtered by the requesting user's role.
 * @param {ServerRequest} req
 * @param {Object} [options]
 * @param {boolean} [options.refresh=false] - Force-refresh models instead of reading cached config.
 * @returns {Promise<TModelsConfig>} The models config.
 */
const getModelsConfig = async (req, options = {}) => {
  const { refresh = false } = options;
  const role = req?.user?.role;
  const openidGroups = req?.user?.openidGroups;
  const tenantId = getModelsTenantId(req);
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = getModelsCacheKey(role, openidGroups, tenantId);

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const baseModels = await loadBaseModels(req, { refresh });
  const appConfig = await getAppConfig({ role, openidGroups, tenantId });
  const filtered = filterModelsByRole(baseModels, appConfig._roleModelRestrictions);

  if (openidGroups && openidGroups.length > 0) {
    // TTL for group-based entries — group combinations are per-user so entries can accumulate
    await cache.set(cacheKey, filtered, Time.TEN_MINUTES);
  } else if (role) {
    await cache.set(cacheKey, filtered);
  }

  return filtered;
};

async function modelController(req, res) {
  try {
    const refresh = req.query?.refresh === 'true' || req.query?.refresh === '1';
    const modelConfig = await getModelsConfig(req, { refresh });
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadBaseModels, getModelsConfig, filterModelsByRole };
