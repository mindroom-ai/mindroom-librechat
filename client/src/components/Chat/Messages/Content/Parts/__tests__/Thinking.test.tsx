import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThinkingButton, ThinkingLabel } from '../Thinking';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useExpandCollapse: () => ({ style: {}, ref: { current: null } }),
}));

jest.mock('~/store/fontSize', () => ({
  fontSizeAtom: { toString: () => 'fontSizeAtom' },
}));

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useAtomValue: () => 'text-xl',
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: () => <button type="button" data-testid="copy-thoughts" />,
}));

jest.mock('~/components/Chat/Messages/MessageAudio', () => ({
  __esModule: true,
  default: ({
    messageId,
    renderButton,
  }: {
    messageId: string;
    renderButton: (props: { onClick: () => void; title: string; icon: null }) => JSX.Element;
  }) => renderButton({ onClick: () => {}, title: `read-aloud-${messageId}`, icon: null }),
}));

/** Every activity row — a tool call, a grouped thought, a phase summary — is
 *  set at `tool-status-text`. A reasoning header sized to the reader's body
 *  text instead was the one row that grew with that setting, so the same
 *  thought read at two sizes depending on which surface held it. */
describe('reasoning header rows', () => {
  it('sets the thinking disclosure at the shared row scale, not the body size', () => {
    render(
      <ThinkingButton
        isExpanded={false}
        onClick={() => {}}
        label="Reframing the analysis"
        contentId="thoughts"
      />,
    );
    const button = screen.getByRole('button', { name: 'Reframing the analysis' });
    expect(button).toHaveClass('tool-status-text');
    expect(button).not.toHaveClass('text-xl');
    expect(screen.getByText('Reframing the analysis')).toHaveClass('font-medium');
  });

  it('sets the non-interactive marker the same way', () => {
    render(<ThinkingLabel label="Thoughts" />);
    const label = screen.getByText('Thoughts');
    expect(label.parentElement).toHaveClass('tool-status-text');
    expect(label.parentElement).not.toHaveClass('text-xl');
    expect(label).toHaveClass('font-medium');
  });
});

/** The floating bar is hidden while the header is on screen, so the header carries read-aloud too. */
describe('reasoning header read-aloud', () => {
  it('offers read-aloud beside copy when expanded', () => {
    render(
      <ThinkingButton
        isExpanded={true}
        onClick={() => {}}
        label="Thoughts"
        content="Weighing the options"
        contentId="thoughts"
        messageId="m1-thinking"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'read-aloud-m1-thinking-thoughts' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('copy-thoughts')).toBeInTheDocument();
  });

  it('keeps read-aloud ids unique per reasoning part', () => {
    render(
      <>
        <ThinkingButton
          isExpanded={true}
          onClick={() => {}}
          label="First"
          content="Same opening words"
          contentId="part-a"
          messageId="m1-thinking"
        />
        <ThinkingButton
          isExpanded={true}
          onClick={() => {}}
          label="Second"
          content="Same opening words"
          contentId="part-b"
          messageId="m1-thinking"
        />
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'read-aloud-m1-thinking-part-a' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'read-aloud-m1-thinking-part-b' }),
    ).toBeInTheDocument();
  });

  /** Collapsing must not unmount the control, or browser speech keeps going with no Stop. */
  it('keeps read-aloud mounted but hidden while collapsed', () => {
    render(
      <ThinkingButton
        isExpanded={false}
        onClick={() => {}}
        label="Thoughts"
        content="Weighing the options"
        contentId="thoughts"
        messageId="m1-thinking"
      />,
    );
    expect(screen.getByRole('button', { name: 'read-aloud-m1-thinking-thoughts' })).toHaveClass(
      'hidden',
    );
  });
});
