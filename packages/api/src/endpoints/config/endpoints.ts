import {
  AuthType,
  CacheKeys,
  CODE_APPROVAL_MODES,
  EModelEndpoint,
  Time,
  isAgentsEndpoint,
  orderEndpointsConfig,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { AgentCapabilities, TEndpointsConfig, TConfig } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ServerRequest, TCustomEndpointsConfig } from '~/types';
import type { GetAppConfigOptions } from '~/app/service';
import { loadCustomEndpointsConfig as defaultLoadCustomEndpoints } from '~/endpoints/custom';
import { getAppConfigOptionsFromUser } from '~/app/service';
import { getResponsesApiRouting } from './responses';

type PartialEndpointEntry = Partial<TConfig> & Record<string, unknown>;
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
  getAppConfig: (params: GetAppConfigOptions & { openidGroups?: string[] }) => Promise<AppConfig>;
  loadDefaultEndpointsConfig: (appConfig: AppConfig) => Promise<DefaultEndpointsResult>;
  loadCustomEndpointsConfig?: (custom: unknown) => TCustomEndpointsConfig | undefined;
  getCache?: (cacheKey: string) => ConfigCache;
}

function getEndpointsCacheKey(params: {
  role?: string;
  userId?: string;
  tenantId?: string;
  openidGroups?: string[];
}): string {
  const { role, userId, tenantId, openidGroups } = params;
  /** `userId` must be part of the key: app config can carry per-user DB overrides */
  const parts: string[] = [];
  if (tenantId) {
    parts.push(`t:${tenantId}`);
  }
  if (userId) {
    parts.push(`u:${userId}`);
  }
  if (openidGroups && openidGroups.length > 0) {
    const groupsPart = JSON.stringify([...openidGroups].sort());
    const rolePart = role || '_';
    parts.push(`g:${rolePart}:${groupsPart}`);
  } else if (role) {
    parts.push(role);
  }
  return parts.length > 0
    ? `${CacheKeys.ENDPOINT_CONFIG}:${parts.join(':')}`
    : CacheKeys.ENDPOINT_CONFIG;
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

export function createEndpointsConfigService(deps: EndpointsConfigDeps): {
  getEndpointsConfig: (req: ServerRequest) => Promise<TEndpointsConfig>;
  checkCapability: (req: ServerRequest, capability: AgentCapabilities) => Promise<boolean>;
} {
  const {
    getAppConfig,
    loadDefaultEndpointsConfig,
    loadCustomEndpointsConfig = defaultLoadCustomEndpoints,
    getCache,
  } = deps;

  async function getEndpointsConfig(req: ServerRequest): Promise<TEndpointsConfig> {
    const openidGroups = req.user?.openidGroups;
    const appConfigOptions = { ...getAppConfigOptionsFromUser(req.user), openidGroups };
    const { role, userId, tenantId } = appConfigOptions;
    const hasScopedContext = Boolean(role || userId || (openidGroups && openidGroups.length > 0));
    const cacheKey = getEndpointsCacheKey({ role, userId, tenantId, openidGroups });
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
        appConfig = await getAppConfig(appConfigOptions);
      } catch (_error) {
        appConfig = req.config;
        shouldCache = false;
      }
    } else {
      appConfig = req.config ?? (await getAppConfig(appConfigOptions));
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

    for (const endpoint of [EModelEndpoint.openAI, EModelEndpoint.azureOpenAI] as const) {
      const entry = mergedConfig[endpoint];
      if (entry)
        mergedConfig[endpoint] = {
          ...entry,
          responsesApiRouting: getResponsesApiRouting(appConfig, endpoint),
        };
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
      const {
        disableBuilder,
        capabilities,
        allowedProviders,
        statefulCodeSessions,
        maxSubagents,
        fileSharing,
      } = appConfig.endpoints[EModelEndpoint.agents];
      const toolApproval = appConfig.endpoints[EModelEndpoint.agents].toolApproval;
      /** Only advertise Accept edits when the endpoint fallback cannot force every
       * unmatched tool back to Ask/Deny. Explicit rules and hooks remain free to
       * tighten individual actions after the user selects the broader mode. */
      let approvalModes = [...CODE_APPROVAL_MODES];
      if (toolApproval?.enabled === false) {
        approvalModes = [];
      } else if (toolApproval?.enabled === true && toolApproval.mode !== 'bypass') {
        approvalModes = ['ask'];
      }
      const clientStatefulCodeSessions = statefulCodeSessions
        ? {
            allowedEnvironments: statefulCodeSessions.allowedEnvironments,
            approvalsEnabled: toolApproval?.enabled !== false,
            approvalModes,
            environments: statefulCodeSessions.environments
              ?.filter(
                (environment) =>
                  !(
                    environment.pairing?.allowPrincipalWorkers === true &&
                    environment.pairing.workerId == null &&
                    environment.workerId == null
                  ),
              )
              .map(({ id, name, type, default: isDefault, configSchema, settings }) => ({
                id,
                name,
                type,
                default: isDefault,
                configSchema,
                settings,
              })),
          }
        : undefined;
      mergedConfig[EModelEndpoint.agents] = {
        ...mergedConfig[EModelEndpoint.agents],
        allowedProviders,
        disableBuilder,
        capabilities,
        statefulCodeSessions: clientStatefulCodeSessions,
        maxSubagents,
        fileSharing,
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

    if (mergedConfig[EModelEndpoint.bedrock]) {
      mergedConfig[EModelEndpoint.bedrock] = {
        ...mergedConfig[EModelEndpoint.bedrock],
        userProvideAccessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID === AuthType.USER_PROVIDED,
        userProvideSecretAccessKey:
          process.env.BEDROCK_AWS_SECRET_ACCESS_KEY === AuthType.USER_PROVIDED,
        userProvideSessionToken: process.env.BEDROCK_AWS_SESSION_TOKEN === AuthType.USER_PROVIDED,
        userProvideBearerToken: process.env.BEDROCK_AWS_BEARER_TOKEN === AuthType.USER_PROVIDED,
      };
    }

    const restrictedConfig = applyEndpointRestrictions(
      mergedConfig,
      appConfig?._roleModelRestrictions,
    );
    const endpointsConfig = orderEndpointsConfig(restrictedConfig as TEndpointsConfig);

    if (cache && shouldCache) {
      if (hasScopedContext) {
        /** Scoped configs can change at runtime (DB overrides, IdP groups) — keep a short TTL */
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
