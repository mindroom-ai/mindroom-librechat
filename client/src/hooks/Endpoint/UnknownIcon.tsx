import { memo } from 'react';
import {
  EModelEndpoint,
  KnownEndpoints,
  normalizeIconURL,
  resolveEndpointIconKey,
} from 'librechat-data-provider';
import { CustomMinimalIcon, XAIcon, MoonshotIcon, AnthropicIcon } from '@librechat/client';
import { IconContext } from '~/common';
import { cn } from '~/utils';

const knownEndpointAssets = {
  [KnownEndpoints.anyscale]: 'assets/anyscale.png',
  [KnownEndpoints.apipie]: 'assets/apipie.png',
  [KnownEndpoints.cohere]: 'assets/cohere.png',
  [KnownEndpoints.deepseek]: 'assets/deepseek.svg',
  [KnownEndpoints.fireworks]: 'assets/fireworks.png',
  [KnownEndpoints.google]: 'assets/google.svg',
  [KnownEndpoints.groq]: 'assets/groq.png',
  [KnownEndpoints.helicone]: 'assets/helicone.png',
  [KnownEndpoints.huggingface]: 'assets/huggingface.svg',
  [KnownEndpoints.mistral]: 'assets/mistral.png',
  [KnownEndpoints.mlx]: 'assets/mlx.png',
  [KnownEndpoints.ollama]: 'assets/ollama.png',
  [KnownEndpoints.openai]: 'assets/openai.svg',
  [KnownEndpoints.openrouter]: 'assets/openrouter.png',
  [KnownEndpoints.perplexity]: 'assets/perplexity.png',
  [KnownEndpoints.qwen]: 'assets/qwen.svg',
  [KnownEndpoints.shuttleai]: 'assets/shuttleai.png',
  [KnownEndpoints['together.ai']]: 'assets/together.png',
  [KnownEndpoints.unify]: 'assets/unify.webp',
  mindroom: 'assets/mindroom-logo.svg',
};

const knownEndpointClasses = {
  [KnownEndpoints.cohere]: {
    [IconContext.landing]: 'p-2',
  },
};

const isDirectImageSource = (value = ''): boolean => {
  const source = value.trim().toLowerCase();
  return (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('/') ||
    source.startsWith('assets/') ||
    source.startsWith('data:image/') ||
    source.startsWith('blob:')
  );
};

const getLookupKey = (value = '') => {
  if (value === EModelEndpoint.openAI) {
    return KnownEndpoints.openai;
  }
  return value.toLowerCase();
};

const getKnownClass = ({
  currentEndpoint,
  context = '',
  className,
}: {
  currentEndpoint: string;
  context?: string;
  className: string;
}) => {
  if (currentEndpoint === KnownEndpoints.openrouter) {
    return className;
  }

  const match = knownEndpointClasses[currentEndpoint]?.[context] ?? '';
  const defaultClass = context === IconContext.landing ? '' : className;

  return cn(match, defaultClass);
};

function UnknownIcon({
  className = '',
  endpoint: _endpoint,
  iconURL = '',
  context,
}: {
  iconURL?: string;
  className?: string;
  endpoint?: EModelEndpoint | string | null;
  context?: 'landing' | 'menu-item' | 'nav' | 'message';
}) {
  const endpoint = _endpoint ?? '';
  const normalizedIconURL = normalizeIconURL(iconURL);
  const endpointAlias = resolveEndpointIconKey(endpoint, { allowTokenMatch: true }) ?? endpoint;
  const iconAlias = resolveEndpointIconKey(normalizedIconURL) ?? normalizedIconURL;
  const currentEndpoint = getLookupKey(endpointAlias);
  const currentIcon = getLookupKey(iconAlias);

  if (!endpoint && !normalizedIconURL) {
    return <CustomMinimalIcon className={className} />;
  }

  if (endpointAlias === EModelEndpoint.anthropic || iconAlias === EModelEndpoint.anthropic) {
    return <AnthropicIcon className={cn(className, 'dark:text-white')} />;
  }

  if (currentEndpoint === KnownEndpoints.xai || currentIcon === KnownEndpoints.xai) {
    return <XAIcon className={cn(className, 'text-black dark:text-white')} />;
  }

  if (currentEndpoint === KnownEndpoints.moonshot || currentIcon === KnownEndpoints.moonshot) {
    return <MoonshotIcon className={cn(className, 'text-black dark:text-white')} />;
  }

  if (normalizedIconURL) {
    const mappedIconAsset = knownEndpointAssets[currentIcon] ?? '';
    if (mappedIconAsset) {
      return (
        <img
          className={getKnownClass({
            currentEndpoint: currentIcon,
            context: context,
            className,
          })}
          src={mappedIconAsset}
          alt={`${currentIcon} Icon`}
        />
      );
    }

    if (isDirectImageSource(normalizedIconURL)) {
      return <img className={className} src={normalizedIconURL} alt={`${endpoint || iconAlias} Icon`} />;
    }
  }

  const assetPath: string = knownEndpointAssets[currentEndpoint] ?? '';

  if (!assetPath) {
    return <CustomMinimalIcon className={className} />;
  }

  return (
    <img
      className={getKnownClass({
        currentEndpoint,
        context: context,
        className,
      })}
      src={assetPath}
      alt={`${currentEndpoint} Icon`}
    />
  );
}

export default memo(UnknownIcon);
