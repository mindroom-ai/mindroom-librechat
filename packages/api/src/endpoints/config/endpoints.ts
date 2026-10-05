import {
  AuthType,
  CODE_APPROVAL_MODES,
  EModelEndpoint,
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

export interface EndpointsConfigDeps {
  getAppConfig: (params: GetAppConfigOptions & { openidGroups?: string[] }) => Promise<AppConfig>;
  loadDefaultEndpointsConfig: (appConfig: AppConfig) => Promise<DefaultEndpointsResult>;
  loadCustomEndpointsConfig?: (custom: unknown) => TCustomEndpointsConfig | undefined;
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
  } = deps;

  async function getEndpointsConfig(req: ServerRequest): Promise<TEndpointsConfig> {
    const openidGroups = req.user?.openidGroups;
    const appConfigOptions = { ...getAppConfigOptionsFromUser(req.user), openidGroups };
    const { role, userId } = appConfigOptions;
    const hasScopedContext = Boolean(role || userId || (openidGroups && openidGroups.length > 0));

    /** A fallback `req.config` is unscoped, so it lacks this user's role/group model restrictions. */
    let appConfig: AppConfig;
    if (req.config && req.configIsFallback && hasScopedContext) {
      try {
        appConfig = await getAppConfig(appConfigOptions);
      } catch (_error) {
        appConfig = req.config;
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
    return orderEndpointsConfig(restrictedConfig as TEndpointsConfig);
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
