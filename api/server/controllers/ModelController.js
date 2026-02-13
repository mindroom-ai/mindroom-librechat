const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');

/**
 * @param {ServerRequest} req
 * @returns {Promise<TModelsConfig>} The models config.
 */
const getModelsConfig = async (req) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @param {Object} [options]
 * @param {boolean} [options.refresh=false] - Force-refresh models instead of reading cached config.
 * @returns {Promise<TModelsConfig>} The models config.
 */
async function loadModels(req, options = {}) {
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

async function modelController(req, res) {
  try {
    const refresh = req.query?.refresh === 'true' || req.query?.refresh === '1';
    const modelConfig = await loadModels(req, { refresh });
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
