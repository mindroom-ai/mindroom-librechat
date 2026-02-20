import { EModelEndpoint, ProviderId, resolveProviderId } from 'librechat-data-provider';

/**
 * Brand fallback for custom endpoints that `resolveEndpointProviderId` leaves unbranded:
 * a name containing a provider word ("MindRoom Claude", "OpenRouter Proxy") takes that
 * provider, and an endpoint named "agents" is MindRoom's.
 */
export function resolveNameProviderFallback(name: string): ProviderId | undefined {
  for (const token of name.split(/[^a-z0-9.]+/i)) {
    const providerId = resolveProviderId(token);
    if (providerId) {
      return providerId;
    }
  }

  if (name.toLowerCase().replace(/[^a-z0-9]+/g, '') === EModelEndpoint.agents) {
    return ProviderId.mindroom;
  }

  return undefined;
}
