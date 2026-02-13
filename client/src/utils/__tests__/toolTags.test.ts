import { parseToolTags } from '../toolTags';

describe('parseToolTags', () => {
  test('parses a single pending tool', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: null,
        raw: 'save_file(file=a.py)',
      },
    ]);
  });

  test('parses a single completed tool with result', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)\nok</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
    ]);
  });

  test('parses a completed tool with empty result', () => {
    const segments = parseToolTags('<tool>save_file(file=a.py)\n</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: '',
        raw: 'save_file(file=a.py)\n',
      },
    ]);
  });

  test('preserves ordering for mixed text and tool content', () => {
    const segments = parseToolTags('Before <tool>save_file(file=a.py)\nok</tool> after');

    expect(segments).toEqual([
      { type: 'text', text: 'Before ' },
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      { type: 'text', text: ' after' },
    ]);
  });

  test('parses tools inside a tool-group into separate tool segments', () => {
    const segments = parseToolTags(
      '<tool-group>\n<tool>save_file(file=a.py)\nok</tool>\n\n<tool>run_shell(cmd=pwd)\n/app</tool>\n</tool-group>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      {
        type: 'tool',
        call: 'run_shell(cmd=pwd)',
        result: '/app',
        raw: 'run_shell(cmd=pwd)\n/app',
      },
    ]);
  });

  test('falls back to plain text for malformed unclosed tool tags', () => {
    const input = 'prefix <tool>save_file(file=a.py)';
    const segments = parseToolTags(input);

    expect(segments).toEqual([{ type: 'text', text: input }]);
  });

  test('decodes escaped tool payload content safely', () => {
    const segments = parseToolTags(
      '<tool>save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        call: 'save_file(file="a<b>.py")',
        result: '<ok & done>',
        raw: 'save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;',
      },
    ]);
  });

  test('returns a single empty text segment for empty input', () => {
    expect(parseToolTags('')).toEqual([{ type: 'text', text: '' }]);
  });
});
