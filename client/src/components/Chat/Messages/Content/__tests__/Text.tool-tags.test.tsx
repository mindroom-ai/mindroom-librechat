import React from 'react';
import { render, screen } from '@testing-library/react';
import { useRecoilValue } from 'recoil';
import { useMessageContext } from '~/Providers';
import Text from '../Parts/Text';

jest.mock('~/components/Chat/Messages/Content/Markdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-lite">{content}</div>,
}));

jest.mock('~/components/Chat/Messages/Content/ToolCall', () => ({
  __esModule: true,
  default: ({
    name,
    args,
    output,
    initialProgress,
    isSubmitting,
    isLast,
  }: {
    name: string;
    args: string;
    output?: string;
    initialProgress: number;
    isSubmitting: boolean;
    isLast?: boolean;
  }) => {
    const state = !isSubmitting && initialProgress < 1 ? 'cancelled' : 'active';

    return (
      <div
        data-testid="tool-call"
        data-name={name}
        data-args={args}
        data-output={output ?? ''}
        data-progress={String(initialProgress)}
        data-state={state}
        data-last={String(Boolean(isLast))}
      />
    );
  },
}));

jest.mock('~/Providers', () => ({
  useMessageContext: jest.fn(),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    enableUserMsgMarkdown: 'enableUserMsgMarkdown',
  },
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useRecoilValue: jest.fn(),
}));

const mockUseMessageContext = useMessageContext as jest.MockedFunction<typeof useMessageContext>;
const mockUseRecoilValue = useRecoilValue as jest.MockedFunction<typeof useRecoilValue>;

const toolStart = (id: number | string, call: string) =>
  `<tool id="${id}" state="start">${call}</tool>`;
const toolDone = (id: number | string, call: string, result: string) =>
  `<tool id="${id}" state="done">${call}\n${result}</tool>`;

describe('Text tool tag rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMessageContext.mockReturnValue({ isSubmitting: true, isLatestMessage: true } as any);
    mockUseRecoilValue.mockReturnValue(true as never);
  });

  test('renders start tool as a ToolCall card and hides raw tags', () => {
    render(
      <Text
        text={toolStart(1, 'save_file(file=a.py)')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toBeInTheDocument();
    expect(toolCall).toHaveAttribute('data-progress', '0.1');
    expect(toolCall).toHaveAttribute('data-output', '');
    expect(screen.queryByText(/<tool/)).not.toBeInTheDocument();
  });

  test('renders done tool output in ToolCall', () => {
    render(
      <Text
        text={toolDone(1, 'save_file(file=a.py)', 'ok')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'save_file');
    expect(toolCall).toHaveAttribute('data-output', 'ok');
    expect(toolCall).toHaveAttribute('data-progress', '1');
  });

  test('renders done empty-result tool as completed state', () => {
    render(
      <Text
        text={toolDone(1, 'save_file(file=a.py)', '')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-progress', '1');
    expect(toolCall).toHaveAttribute('data-output', '');
  });

  test('renders consecutive tools as separate cards', () => {
    render(
      <Text
        text={[
          toolDone(1, 'save_file(file=a.py)', 'ok'),
          toolDone(2, 'run_shell(cmd=pwd)', '/app'),
        ].join('')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
    expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
  });

  test('preserves surrounding markdown for mixed text and tool content', () => {
    render(
      <Text
        text={`Before **bold**\n\n${toolDone(1, 'save_file(file=a.py)', 'ok')}\n\nAfter _text_`}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const markdownBlocks = screen.getAllByTestId('markdown');
    expect(markdownBlocks).toHaveLength(2);
    expect(markdownBlocks[0]).toHaveTextContent('Before **bold**');
    expect(markdownBlocks[1]).toHaveTextContent('After _text_');
    expect(screen.getByTestId('tool-call')).toBeInTheDocument();
  });

  test('keeps user message rendering path unchanged', () => {
    render(
      <Text
        text={toolStart(1, 'save_file(file=a.py)')}
        isCreatedByUser={true}
        showCursor={false}
      />,
    );

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-lite')).toHaveTextContent(
      toolStart(1, 'save_file(file=a.py)'),
    );
  });

  test('updates start tool to done tool on rerender', () => {
    const { rerender } = render(
      <Text
        text={toolStart(1, 'save_file(file=a.py)')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-progress', '0.1');

    rerender(
      <Text
        text={toolDone(1, 'save_file(file=a.py)', 'ok')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-progress', '1');
    expect(toolCall).toHaveAttribute('data-output', 'ok');
  });

  test('marks start tool as cancelled when stream is no longer submitting', () => {
    mockUseMessageContext.mockReturnValue({ isSubmitting: false, isLatestMessage: true } as any);

    render(
      <Text
        text={toolStart(1, 'save_file(file=a.py)')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-state', 'cancelled');
  });

  test('uses markdown fast path when no tool tags are present', () => {
    render(
      <Text
        text={'# Hello World\n\nThis is plain markdown.'}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello World');
    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
  });

  test('renders tools inside tool-group as separate ToolCall cards', () => {
    render(
      <Text
        text={[
          '<tool-group>',
          toolDone(1, 'save_file(file=a.py)', 'ok'),
          '',
          toolDone(2, 'run_shell(cmd=pwd)', '/app'),
          '</tool-group>',
        ].join('\n')}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'save_file');
    expect(toolCalls[0]).toHaveAttribute('data-output', 'ok');
    expect(toolCalls[1]).toHaveAttribute('data-name', 'run_shell');
    expect(toolCalls[1]).toHaveAttribute('data-output', '/app');
  });

  test('renders unclosed tool fragments as plain markdown text', () => {
    const text = 'Hello <tool id="1" state="start">save_file(file=a.py)';
    render(<Text text={text} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent(text);
  });

  test('renders old-format tool tags as plain markdown text', () => {
    const text = '<tool>save_file(file=a.py)\nok</tool>';
    render(<Text text={text} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('<tool>save_file(file=a.py)');
    expect(markdown.textContent).toContain('ok</tool>');
  });

  test('decodes HTML entities in tool args and output before rendering ToolCall', () => {
    render(
      <Text
        text={
          '<tool id="1" state="done">save_file(content=&lt;div&gt;hello&lt;/div&gt;)\n&amp;done</tool>'
        }
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-args', 'save_file(content=<div>hello</div>)');
    expect(toolCall).toHaveAttribute('data-output', '&done');
  });

  test('derives tool name from call even when no parenthesis is present', () => {
    render(
      <Text text={toolDone(1, 'save_file', 'ok')} isCreatedByUser={false} showCursor={false} />,
    );

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'save_file');
    expect(toolCall).toHaveAttribute('data-args', 'save_file');
  });

  test('falls back to tool name "tool" for empty or invalid call prefix', () => {
    render(<Text text={toolDone(1, '(weird)', 'ok')} isCreatedByUser={false} showCursor={false} />);

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'tool');
  });

  test('marks the last tool as isLast even when trailing whitespace text is filtered', () => {
    render(
      <Text
        text={`${toolDone(1, 'save_file(file=a.py)', 'ok')}\n\n`}
        isCreatedByUser={false}
        showCursor={false}
      />,
    );

    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-last', 'true');
  });

  test('renders inline-code tool tags as markdown text, not ToolCall cards', () => {
    const content =
      'Use `<tool id="1" state="done">save_file(file=a.py)\nok</tool>` as literal documentation.';
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('Use `<tool id="1" state="done">save_file(file=a.py)');
    expect(markdown.textContent).toContain('ok</tool>` as literal documentation.');
  });

  test('renders fenced-code tool tags as markdown text, not ToolCall cards', () => {
    const content = [
      '```txt',
      '<tool id="1" state="done">save_file(file=a.py)',
      'ok</tool>',
      '```',
    ].join('\n');

    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('```txt');
    expect(markdown.textContent).toContain('<tool id="1" state="done">save_file(file=a.py)');
    expect(markdown.textContent).toContain('ok</tool>');
    expect(markdown.textContent).toContain('```');
  });

  test('keeps fenced examples as markdown and renders real tool tag outside fence', () => {
    const content = [
      '```txt',
      '<tool id="1" state="done">example_call()',
      'example_result</tool>',
      '```',
      '',
      '<tool id="2" state="done">run_shell(cmd=pwd)',
      '/app</tool>',
    ].join('\n');

    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    const markdown = screen.getByTestId('markdown');
    expect(markdown.textContent).toContain('```txt');
    expect(markdown.textContent).toContain('<tool id="1" state="done">example_call()');
    expect(markdown.textContent).toContain('example_result</tool>');
    expect(markdown.textContent).toContain('```');
    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-name', 'run_shell');
    expect(toolCall).toHaveAttribute('data-output', '/app');
  });

  test('collapses start+done duplicate tool blocks into one completed card', () => {
    const content = [
      toolStart(1, 'search_knowledge_base(query=tools capabilities)'),
      '',
      toolDone(1, 'search_knowledge_base(query=tools capabilities)', '[{"name":"a.md"}]'),
    ].join('\n');

    mockUseMessageContext.mockReturnValue({ isSubmitting: false, isLatestMessage: true } as any);
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'search_knowledge_base');
    expect(toolCalls[0]).toHaveAttribute('data-output', '[{"name":"a.md"}]');
    expect(toolCalls[0]).toHaveAttribute('data-progress', '1');
    expect(toolCalls[0]).toHaveAttribute('data-state', 'active');
  });

  test('keeps tool card anchored where start appeared when done arrives later', () => {
    const content = [
      'Before tool',
      toolStart(1, 'search_knowledge_base(query=tools capabilities)'),
      'Assistant keeps writing while tool runs.',
      toolDone(1, 'search_knowledge_base(query=tools capabilities)', '[{"name":"a.md"}]'),
      'After tool',
    ].join('\n');

    mockUseMessageContext.mockReturnValue({ isSubmitting: false, isLatestMessage: true } as any);
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    const toolCall = screen.getByTestId('tool-call');
    expect(toolCall).toHaveAttribute('data-output', '[{"name":"a.md"}]');
    expect(toolCall).toHaveAttribute('data-progress', '1');

    const markdownBlocks = screen.getAllByTestId('markdown');
    expect(markdownBlocks).toHaveLength(2);
    expect(markdownBlocks[1].textContent).toContain('Assistant keeps writing while tool runs.');
    expect(markdownBlocks[1].textContent).toContain('After tool');

    const orderedParts = screen
      .getAllByTestId(/^(tool-call|markdown)$/)
      .map((el) => el.dataset.testid);
    expect(orderedParts).toEqual(['markdown', 'tool-call', 'markdown']);
  });

  test('collapses batched start blocks followed by done blocks', () => {
    const content = [
      toolStart(1, 'search_knowledge_base(query=one)'),
      toolStart(2, 'search_knowledge_base(query=two)'),
      toolDone(1, 'search_knowledge_base(query=one)', 'result-one'),
      toolDone(2, 'search_knowledge_base(query=two)', 'result-two'),
    ].join('\n\n');

    mockUseMessageContext.mockReturnValue({ isSubmitting: false, isLatestMessage: true } as any);
    render(<Text text={content} isCreatedByUser={false} showCursor={false} />);

    const toolCalls = screen.getAllByTestId('tool-call');
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toHaveAttribute('data-name', 'search_knowledge_base');
    expect(toolCalls[0]).toHaveAttribute('data-output', 'result-one');
    expect(toolCalls[0]).toHaveAttribute('data-state', 'active');
    expect(toolCalls[1]).toHaveAttribute('data-name', 'search_knowledge_base');
    expect(toolCalls[1]).toHaveAttribute('data-output', 'result-two');
    expect(toolCalls[1]).toHaveAttribute('data-state', 'active');
  });
});
