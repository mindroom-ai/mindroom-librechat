const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
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
      filtered[endpoint] = models.filter((m) => allowed.has(m));
    } else {
      filtered[endpoint] = models;
    }
  }
  return filtered;
}

/**
 * Build a cache key for the models config based on role and/or groups.
 * @param {string} [role]
 * @param {string[]} [openidGroups]
 * @returns {string}
 */
function getModelsCacheKey(role, openidGroups) {
  if (openidGroups && openidGroups.length > 0) {
    const sorted = [...openidGroups].sort().join(',');
    return `${CacheKeys.MODELS_CONFIG}:g:${sorted}`;
  }
  return role ? `${CacheKeys.MODELS_CONFIG}:${role}` : CacheKeys.MODELS_CONFIG;
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
  if (!refresh) {
    const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
    if (cachedModelsConfig) {
      return cachedModelsConfig;
    }
  }

  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);

  const modelConfig = { ...defaultModelsConfig, ...customModelsConfig };

  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
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
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cacheKey = getModelsCacheKey(role, openidGroups);

  if (!refresh) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const baseModels = await loadBaseModels(req, { refresh });
  const appConfig = await getAppConfig({ role, openidGroups });
  const filtered = filterModelsByRole(baseModels, appConfig._roleModelRestrictions);

  if (role || (openidGroups && openidGroups.length > 0)) {
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
