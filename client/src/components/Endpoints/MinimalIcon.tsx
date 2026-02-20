import { Feather } from 'lucide-react';
import {
  EModelEndpoint,
  alternateName,
  normalizeIconURL,
  resolveEndpointIconKey,
} from 'librechat-data-provider';
import {
  Sparkles,
  BedrockIcon,
  AnthropicIcon,
  AzureMinimalIcon,
  OpenAIMinimalIcon,
  GoogleMinimalIcon,
  CustomMinimalIcon,
} from '@librechat/client';
import UnknownIcon from '~/hooks/Endpoint/UnknownIcon';
import { IconProps } from '~/common';
import { cn } from '~/utils';

const MinimalIcon: React.FC<IconProps> = (props) => {
  const { size = 30, iconURL = '', iconClassName, error } = props;
  const normalizedIconURL = normalizeIconURL(iconURL);

  let endpoint = 'default'; // Default value for endpoint

  if (typeof props.endpoint === 'string') {
    endpoint = props.endpoint;
  }

  const resolvedEndpoint = resolveEndpointIconKey(endpoint, { allowTokenMatch: true }) ?? endpoint;

  const endpointIcons = {
    [EModelEndpoint.azureOpenAI]: {
      icon: <AzureMinimalIcon className={iconClassName} />,
      name: props.chatGptLabel ?? 'ChatGPT',
    },
    [EModelEndpoint.openAI]: {
      icon: <OpenAIMinimalIcon className={iconClassName} />,
      name: props.chatGptLabel ?? 'ChatGPT',
    },
    [EModelEndpoint.google]: { icon: <GoogleMinimalIcon />, name: props.modelLabel ?? 'Google' },
    [EModelEndpoint.anthropic]: {
      icon: <AnthropicIcon className="icon-md shrink-0 dark:text-white" />,
      name: props.modelLabel ?? 'Claude',
    },
    [EModelEndpoint.custom]: {
      icon: <CustomMinimalIcon />,
      name: 'Custom',
    },
    [EModelEndpoint.assistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.azureAssistants]: { icon: <Sparkles className="icon-sm" />, name: 'Assistant' },
    [EModelEndpoint.agents]: {
      icon: <Feather className="icon-sm" aria-hidden="true" />,
      name: props.modelLabel ?? alternateName[EModelEndpoint.agents],
    },
    [EModelEndpoint.bedrock]: {
      icon: <BedrockIcon className="icon-xl text-text-primary" />,
      name: props.modelLabel ?? alternateName[EModelEndpoint.bedrock],
    },
    default: {
      icon: (
        <UnknownIcon
          iconURL={normalizedIconURL}
          endpoint={endpoint}
          className="icon-sm"
          context="nav"
        />
      ),
      name: endpoint,
    },
  };

  let { icon, name } = endpointIcons[resolvedEndpoint] ?? endpointIcons.default;
  if (normalizedIconURL && endpointIcons[normalizedIconURL] != null) {
    ({ icon, name } = endpointIcons[normalizedIconURL]);
  }

  return (
    <div
      data-testid="convo-icon"
      title={name}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
      }}
      className={cn(
        'relative flex items-center justify-center rounded-sm text-text-secondary',
        props.className ?? '',
      )}
    >
      {icon}
      {error === true && (
        <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-text-secondary">
          !
        </span>
      )}
    </div>
  );
};

export default MinimalIcon;
