const { loadCustomEndpointsConfig } = require('@librechat/api');
const {
  CacheKeys,
  EModelEndpoint,
  isAgentsEndpoint,
  orderEndpointsConfig,
  defaultAgentCapabilities,
  Time,
} = require('librechat-data-provider');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const getLogStores = require('~/cache/getLogStores');
const { getAppConfig } = require('./app');

/**
 * Build cache key for endpoints config, scoped to role/groups.
 * @param {string | undefined} role
 * @param {string[] | undefined} openidGroups
 * @returns {string}
 */
function getEndpointsCacheKey(role, openidGroups) {
  if (openidGroups && openidGroups.length > 0) {
    const groupsPart = JSON.stringify([...openidGroups].sort());
    const rolePart = role || '_';
    return `${CacheKeys.ENDPOINT_CONFIG}:g:${rolePart}:${groupsPart}`;
  }
  return role ? `${CacheKeys.ENDPOINT_CONFIG}:${role}` : CacheKeys.ENDPOINT_CONFIG;
}

/**
 * Remove endpoints explicitly blocked by role/group model restrictions.
 * A restriction with `models: []` means hide the endpoint completely.
 *
 * @param {TEndpointsConfig} mergedConfig
 * @param {Record<string, { models: string[] }> | undefined} restrictions
 * @returns {TEndpointsConfig}
 */
function applyEndpointRestrictions(mergedConfig, restrictions) {
  if (!restrictions) {
    return mergedConfig;
  }

  const filteredConfig = { ...mergedConfig };

  for (const [endpointKey, restriction] of Object.entries(restrictions)) {
    if (Array.isArray(restriction?.models) && restriction.models.length === 0) {
      delete filteredConfig[endpointKey];
    }
  }

  return filteredConfig;
}

/**
 *
 * @param {ServerRequest} req
 * @returns {Promise<TEndpointsConfig>}
 */
async function getEndpointsConfig(req) {
  const role = req.user?.role;
  const openidGroups = req.user?.openidGroups;
  const hasScopedContext = Boolean(role || (openidGroups && openidGroups.length > 0));
  const cacheKey = getEndpointsCacheKey(role, openidGroups);
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedEndpointsConfig = await cache.get(cacheKey);
  if (cachedEndpointsConfig) {
    if (cachedEndpointsConfig.gptPlugins) {
      await cache.delete(cacheKey);
    } else {
      return cachedEndpointsConfig;
    }
  }

  /** Do not cache scoped entries from unscoped fallback config. */
  let shouldCache = true;
  let appConfig;

  if (req.config && req.configIsFallback && hasScopedContext) {
    try {
      appConfig = await getAppConfig({ role, openidGroups });
    } catch (_error) {
      appConfig = req.config;
      shouldCache = false;
    }
  } else {
    appConfig = req.config ?? (await getAppConfig({ role, openidGroups }));
  }

  const defaultEndpointsConfig = await loadDefaultEndpointsConfig(appConfig);
  const customEndpointsConfig = loadCustomEndpointsConfig(appConfig?.endpoints?.custom);

  /** @type {TEndpointsConfig} */
  const mergedConfig = {
    ...defaultEndpointsConfig,
    ...customEndpointsConfig,
  };

  if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]) {
    /** @type {Omit<TConfig, 'order'>} */
    mergedConfig[EModelEndpoint.azureOpenAI] = {
      userProvide: false,
    };
  }

  // Enable Anthropic endpoint when Vertex AI is configured in YAML
  if (appConfig.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig?.enabled) {
    /** @type {Omit<TConfig, 'order'>} */
    mergedConfig[EModelEndpoint.anthropic] = {
      userProvide: false,
    };
  }

  if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
    /** @type {Omit<TConfig, 'order'>} */
    mergedConfig[EModelEndpoint.azureAssistants] = {
      userProvide: false,
    };
  }

  if (
    mergedConfig[EModelEndpoint.assistants] &&
    appConfig?.endpoints?.[EModelEndpoint.assistants]
  ) {
    const { disableBuilder, retrievalModels, capabilities, version, ..._rest } =
      appConfig.endpoints[EModelEndpoint.assistants];

    mergedConfig[EModelEndpoint.assistants] = {
      ...mergedConfig[EModelEndpoint.assistants],
      version,
      retrievalModels,
      disableBuilder,
      capabilities,
    };
  }
  if (mergedConfig[EModelEndpoint.agents] && appConfig?.endpoints?.[EModelEndpoint.agents]) {
    const { disableBuilder, capabilities, allowedProviders, ..._rest } =
      appConfig.endpoints[EModelEndpoint.agents];

    mergedConfig[EModelEndpoint.agents] = {
      ...mergedConfig[EModelEndpoint.agents],
      allowedProviders,
      disableBuilder,
      capabilities,
    };
  }

  if (
    mergedConfig[EModelEndpoint.azureAssistants] &&
    appConfig?.endpoints?.[EModelEndpoint.azureAssistants]
  ) {
    const { disableBuilder, retrievalModels, capabilities, version, ..._rest } =
      appConfig.endpoints[EModelEndpoint.azureAssistants];

    mergedConfig[EModelEndpoint.azureAssistants] = {
      ...mergedConfig[EModelEndpoint.azureAssistants],
      version,
      retrievalModels,
      disableBuilder,
      capabilities,
    };
  }

  if (mergedConfig[EModelEndpoint.bedrock] && appConfig?.endpoints?.[EModelEndpoint.bedrock]) {
    const { availableRegions } = appConfig.endpoints[EModelEndpoint.bedrock];
    mergedConfig[EModelEndpoint.bedrock] = {
      ...mergedConfig[EModelEndpoint.bedrock],
      availableRegions,
    };
  }

  const restrictedConfig = applyEndpointRestrictions(
    mergedConfig,
    appConfig?._roleModelRestrictions,
  );
  const endpointsConfig = orderEndpointsConfig(restrictedConfig);

  if (shouldCache) {
    if (openidGroups && openidGroups.length > 0) {
      await cache.set(cacheKey, endpointsConfig, Time.TEN_MINUTES);
    } else {
      await cache.set(cacheKey, endpointsConfig);
    }
  }
  return endpointsConfig;
}

/**
 * @param {ServerRequest} req
 * @param {import('librechat-data-provider').AgentCapabilities} capability
 * @returns {Promise<boolean>}
 */
const checkCapability = async (req, capability) => {
  const isAgents = isAgentsEndpoint(req.body?.endpointType || req.body?.endpoint);
  const endpointsConfig = await getEndpointsConfig(req);
  const capabilities =
    isAgents || endpointsConfig?.[EModelEndpoint.agents]?.capabilities != null
      ? (endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [])
      : defaultAgentCapabilities;
  return capabilities.includes(capability);
};

module.exports = { getEndpointsConfig, checkCapability };
