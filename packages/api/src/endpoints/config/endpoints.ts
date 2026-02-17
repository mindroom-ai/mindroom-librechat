import {
  CacheKeys,
  EModelEndpoint,
  Time,
  isAgentsEndpoint,
  orderEndpointsConfig,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { AgentCapabilities, TEndpointsConfig, TConfig } from 'librechat-data-provider';
import type { ServerRequest, TCustomEndpointsConfig } from '~/types';
import { loadCustomEndpointsConfig as defaultLoadCustomEndpoints } from '~/endpoints/custom';

type PartialEndpointEntry = Partial<TConfig>;
type DefaultEndpointsResult = Record<string, PartialEndpointEntry | false | null>;
type MutableEndpointsConfig = Record<string, PartialEndpointEntry | false | null | undefined>;
type ConfigCache = {
  get: (
    key: string,
  ) => Promise<TEndpointsConfig | ({ gptPlugins?: unknown } & TEndpointsConfig) | null>;
  set: (key: string, value: TEndpointsConfig, expires?: number) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

export interface EndpointsConfigDeps {
  getAppConfig: (params: {
    role?: string | null;
    tenantId?: string;
    openidGroups?: string[];
  }) => Promise<AppConfig>;
  loadDefaultEndpointsConfig: (appConfig: AppConfig) => Promise<DefaultEndpointsResult>;
  loadCustomEndpointsConfig?: (custom: unknown) => TCustomEndpointsConfig | undefined;
  getCache?: (cacheKey: string) => ConfigCache;
}

function getEndpointsCacheKey(role?: string | null, openidGroups?: string[]): string {
  if (openidGroups && openidGroups.length > 0) {
    const groupsPart = JSON.stringify([...openidGroups].sort());
    const rolePart = role || '_';
    return `${CacheKeys.ENDPOINT_CONFIG}:g:${rolePart}:${groupsPart}`;
  }
  return role ? `${CacheKeys.ENDPOINT_CONFIG}:${role}` : CacheKeys.ENDPOINT_CONFIG;
}

function applyEndpointRestrictions(
  mergedConfig: MutableEndpointsConfig,
  restrictions?: Record<string, { models: string[] }>,
): MutableEndpointsConfig {
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

export function createEndpointsConfigService(deps: EndpointsConfigDeps) {
  const {
    getAppConfig,
    loadDefaultEndpointsConfig,
    loadCustomEndpointsConfig = defaultLoadCustomEndpoints,
    getCache,
  } = deps;

  async function getEndpointsConfig(req: ServerRequest): Promise<TEndpointsConfig> {
    const role = req.user?.role;
    const tenantId = req.user?.tenantId;
    const openidGroups = req.user?.openidGroups;
    const hasScopedContext = Boolean(role || (openidGroups && openidGroups.length > 0));
    const cacheKey = getEndpointsCacheKey(role, openidGroups);
    const cache = getCache?.(CacheKeys.CONFIG_STORE);
    const cachedEndpointsConfig = await cache?.get(cacheKey);
    if (cachedEndpointsConfig) {
      if (cachedEndpointsConfig.gptPlugins) {
        await cache?.delete(cacheKey);
      } else {
        return cachedEndpointsConfig;
      }
    }

    let shouldCache = true;
    let appConfig: AppConfig;
    if (req.config && req.configIsFallback && hasScopedContext) {
      try {
        appConfig = await getAppConfig({ role, tenantId, openidGroups });
      } catch (_error) {
        appConfig = req.config;
        shouldCache = false;
      }
    } else {
      appConfig = req.config ?? (await getAppConfig({ role, tenantId, openidGroups }));
    }

    const defaultEndpointsConfig = await loadDefaultEndpointsConfig(appConfig);
    const customEndpointsConfig = loadCustomEndpointsConfig(appConfig?.endpoints?.custom);

    const mergedConfig: MutableEndpointsConfig = {
      ...defaultEndpointsConfig,
      ...customEndpointsConfig,
    };

    if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]) {
      mergedConfig[EModelEndpoint.azureOpenAI] = { userProvide: false };
    }

    if (appConfig.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig?.enabled) {
      mergedConfig[EModelEndpoint.anthropic] = { userProvide: false };
    }

    if (appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.assistants) {
      mergedConfig[EModelEndpoint.azureAssistants] = { userProvide: false };
    }

    if (
      mergedConfig[EModelEndpoint.assistants] &&
      appConfig?.endpoints?.[EModelEndpoint.assistants]
    ) {
      const { disableBuilder, retrievalModels, capabilities, version } =
        appConfig.endpoints[EModelEndpoint.assistants];
      mergedConfig[EModelEndpoint.assistants] = {
        ...mergedConfig[EModelEndpoint.assistants],
        version: version != null ? String(version) : undefined,
        retrievalModels,
        disableBuilder,
        capabilities,
      };
    }

    if (mergedConfig[EModelEndpoint.agents] && appConfig?.endpoints?.[EModelEndpoint.agents]) {
      const { disableBuilder, capabilities, allowedProviders } =
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
      const { disableBuilder, retrievalModels, capabilities, version } =
        appConfig.endpoints[EModelEndpoint.azureAssistants];
      mergedConfig[EModelEndpoint.azureAssistants] = {
        ...mergedConfig[EModelEndpoint.azureAssistants],
        version: version != null ? String(version) : undefined,
        retrievalModels,
        disableBuilder,
        capabilities,
      };
    }

    if (mergedConfig[EModelEndpoint.bedrock] && appConfig?.endpoints?.[EModelEndpoint.bedrock]) {
      const { availableRegions } = appConfig.endpoints[EModelEndpoint.bedrock] as {
        availableRegions?: string[];
      };
      mergedConfig[EModelEndpoint.bedrock] = {
        ...mergedConfig[EModelEndpoint.bedrock],
        availableRegions,
      };
    }

    const restrictedConfig = applyEndpointRestrictions(
      mergedConfig,
      appConfig?._roleModelRestrictions,
    );
    const endpointsConfig = orderEndpointsConfig(restrictedConfig as TEndpointsConfig);

    if (cache && shouldCache) {
      if (openidGroups && openidGroups.length > 0) {
        await cache.set(cacheKey, endpointsConfig, Time.TEN_MINUTES);
      } else {
        await cache.set(cacheKey, endpointsConfig);
      }
    }

    return endpointsConfig;
  }

  async function checkCapability(
    req: ServerRequest,
    capability: AgentCapabilities,
  ): Promise<boolean> {
    const isAgents = isAgentsEndpoint(req.body?.endpointType || req.body?.endpoint);
    const endpointsConfig = await getEndpointsConfig(req);
    const capabilities =
      isAgents || endpointsConfig?.[EModelEndpoint.agents]?.capabilities != null
        ? (endpointsConfig?.[EModelEndpoint.agents]?.capabilities ?? [])
        : defaultAgentCapabilities;
    return capabilities.includes(capability);
  }

  return { getEndpointsConfig, checkCapability };
}
