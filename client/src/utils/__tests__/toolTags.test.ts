import { parseToolTags } from '../toolTags';

describe('parseToolTags', () => {
  test('parses a single start tool block', () => {
    const segments = parseToolTags('<tool id="1" state="start">save_file(file=a.py)</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'start',
        call: 'save_file(file=a.py)',
        result: null,
        raw: 'save_file(file=a.py)',
      },
    ]);
  });

  test('parses a single done tool block with result', () => {
    const segments = parseToolTags('<tool id="1" state="done">save_file(file=a.py)\nok</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
    ]);
  });

  test('parses a done tool with empty result', () => {
    const segments = parseToolTags('<tool id="1" state="done">save_file(file=a.py)\n</tool>');

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(file=a.py)',
        result: '',
        raw: 'save_file(file=a.py)\n',
      },
    ]);
  });

  test('preserves ordering for mixed text and tool content', () => {
    const segments = parseToolTags(
      'Before <tool id="1" state="done">save_file(file=a.py)\nok</tool> after',
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Before ' },
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      { type: 'text', text: ' after' },
    ]);
  });

  test('parses tools inside a tool-group into separate tool segments', () => {
    const segments = parseToolTags(
      [
        '<tool-group>',
        '<tool id="1" state="done">save_file(file=a.py)\nok</tool>',
        '',
        '<tool id="2" state="done">run_shell(cmd=pwd)\n/app</tool>',
        '</tool-group>',
      ].join('\n'),
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(file=a.py)',
        result: 'ok',
        raw: 'save_file(file=a.py)\nok',
      },
      {
        type: 'tool',
        id: '2',
        state: 'done',
        call: 'run_shell(cmd=pwd)',
        result: '/app',
        raw: 'run_shell(cmd=pwd)\n/app',
      },
    ]);
  });

  test('treats old-format tool tags as plain text', () => {
    const input = '<tool>save_file(file=a.py)\nok</tool>';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('treats tool tags without id as plain text', () => {
    const input = '<tool state="done">save_file(file=a.py)\nok</tool>';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('treats tool tags without state as plain text', () => {
    const input = '<tool id="1">save_file(file=a.py)\nok</tool>';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('treats malformed unclosed tool tags as plain text', () => {
    const input = 'prefix <tool id="1" state="start">save_file(file=a.py)';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('decodes escaped tool payload content safely', () => {
    const segments = parseToolTags(
      '<tool id="1" state="done">save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(file="a<b>.py")',
        result: '<ok & done>',
        raw: 'save_file(file=&quot;a&lt;b&gt;.py&quot;)\n&lt;ok &amp; done&gt;',
      },
    ]);
  });

  test('decodes numeric HTML entities in call and result', () => {
    const segments = parseToolTags(
      '<tool id="1" state="done">save_file(msg=&#34;hi&#34;)\n&#x3c;ok&#x3e;</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'save_file(msg="hi")',
        result: '<ok>',
        raw: 'save_file(msg=&#34;hi&#34;)\n&#x3c;ok&#x3e;',
      },
    ]);
  });

  test('returns a single empty text segment for empty input', () => {
    expect(parseToolTags('')).toEqual([{ type: 'text', text: '' }]);
  });

  test('returns a single text segment for plain text with no tool tags', () => {
    const input = 'Just plain markdown text without any tool tags.';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('preserves multiline tool result content', () => {
    const segments = parseToolTags(
      '<tool id="1" state="done">run_shell(cmd=cat file.txt)\nline 1\nline 2\nline 3</tool>',
    );

    expect(segments).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'run_shell(cmd=cat file.txt)',
        result: 'line 1\nline 2\nline 3',
        raw: 'run_shell(cmd=cat file.txt)\nline 1\nline 2\nline 3',
      },
    ]);
  });

  test('preserves text before and after a tool-group block', () => {
    const segments = parseToolTags(
      [
        'Before group',
        '',
        '<tool-group>',
        '<tool id="1" state="done">foo()\nbar</tool>',
        '</tool-group>',
        '',
        'After group',
      ].join('\n'),
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Before group\n\n' },
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'foo()',
        result: 'bar',
        raw: 'foo()\nbar',
      },
      { type: 'text', text: '\n\nAfter group' },
    ]);
  });

  test('treats unclosed tool-group as plain text', () => {
    const input = '<tool-group><tool id="1" state="done">foo()\nbar</tool>';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('preserves exact interleaving order of text and tool segments', () => {
    const segments = parseToolTags(
      [
        'A',
        '',
        '<tool id="1" state="done">t1()\nr1</tool>',
        '',
        'B',
        '',
        '<tool id="2" state="done">t2()\nr2</tool>',
        '',
        'C',
      ].join('\n'),
    );

    expect(segments).toEqual([
      { type: 'text', text: 'A\n\n' },
      { type: 'tool', id: '1', state: 'done', call: 't1()', result: 'r1', raw: 't1()\nr1' },
      { type: 'text', text: '\n\nB\n\n' },
      { type: 'tool', id: '2', state: 'done', call: 't2()', result: 'r2', raw: 't2()\nr2' },
      { type: 'text', text: '\n\nC' },
    ]);
  });

  test('does not parse tool tags inside inline markdown code spans', () => {
    const input = 'Use `<tool id="1" state="done">save_file(file=a.py)\nok</tool>` as an example.';
    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('does not parse tool tags inside fenced markdown code blocks', () => {
    const input = [
      '```xml',
      '<tool id="1" state="done">save_file(file=a.py)',
      'ok</tool>',
      '```',
      '',
      'This is documentation text.',
    ].join('\n');

    expect(parseToolTags(input)).toEqual([{ type: 'text', text: input }]);
  });

  test('parses tool tags outside fenced code blocks while keeping fenced examples as text', () => {
    const input = [
      '```txt',
      '<tool id="1" state="done">example_call()',
      'example_result</tool>',
      '```',
      '',
      '<tool id="2" state="done">run_shell(cmd=pwd)',
      '/app</tool>',
    ].join('\n');

    expect(parseToolTags(input)).toEqual([
      {
        type: 'text',
        text: '```txt\n<tool id="1" state="done">example_call()\nexample_result</tool>\n```\n\n',
      },
      {
        type: 'tool',
        id: '2',
        state: 'done',
        call: 'run_shell(cmd=pwd)',
        result: '/app',
        raw: 'run_shell(cmd=pwd)\n/app',
      },
    ]);
  });

  test('collapses start+done duplicate blocks by matching id', () => {
    const segments = parseToolTags(
      [
        '<tool id="1" state="start">search_knowledge_base(query=tools)</tool>',
        '',
        '<tool id="1" state="done">search_knowledge_base(query=tools)\n[{&quot;name&quot;:&quot;a.md&quot;}]</tool>',
      ].join('\n'),
    );

    const tools = segments.filter((segment) => segment.type === 'tool');
    expect(tools).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'search_knowledge_base(query=tools)',
        result: '[{"name":"a.md"}]',
        raw: 'search_knowledge_base(query=tools)\n[{&quot;name&quot;:&quot;a.md&quot;}]',
      },
    ]);
  });

  test('keeps tool anchored at start position when done appears later', () => {
    const segments = parseToolTags(
      [
        'Before tool',
        '<tool id="1" state="start">search_knowledge_base(query=tools)</tool>',
        'Assistant keeps writing while tool runs.',
        '<tool id="1" state="done">search_knowledge_base(query=tools)\n[{"name":"a.md"}]</tool>',
        'After tool',
      ].join('\n'),
    );

    expect(segments).toEqual([
      { type: 'text', text: 'Before tool\n' },
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'search_knowledge_base(query=tools)',
        result: '[{"name":"a.md"}]',
        raw: 'search_knowledge_base(query=tools)\n[{"name":"a.md"}]',
      },
      { type: 'text', text: '\nAssistant keeps writing while tool runs.\n\nAfter tool' },
    ]);
  });

  test('does not collapse distinct tool calls with different ids', () => {
    const segments = parseToolTags(
      [
        '<tool id="1" state="start">search_knowledge_base(query=tools)</tool>',
        '<tool id="2" state="done">search_knowledge_base(query=tools)\nresult</tool>',
      ].join('\n'),
    );

    const tools = segments.filter((segment) => segment.type === 'tool');
    expect(tools).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'start',
        call: 'search_knowledge_base(query=tools)',
        result: null,
        raw: 'search_knowledge_base(query=tools)',
      },
      {
        type: 'tool',
        id: '2',
        state: 'done',
        call: 'search_knowledge_base(query=tools)',
        result: 'result',
        raw: 'search_knowledge_base(query=tools)\nresult',
      },
    ]);
  });

  test('collapses batched start blocks when matching done blocks arrive later', () => {
    const segments = parseToolTags(
      [
        '<tool id="1" state="start">search_knowledge_base(query=one)</tool>',
        '<tool id="2" state="start">search_knowledge_base(query=two)</tool>',
        '<tool id="3" state="start">search_knowledge_base(query=three)</tool>',
        '<tool id="1" state="done">search_knowledge_base(query=one)\nresult-one</tool>',
        '<tool id="2" state="done">search_knowledge_base(query=two)\nresult-two</tool>',
        '<tool id="3" state="done">search_knowledge_base(query=three)\nresult-three</tool>',
      ].join('\n\n'),
    );

    const tools = segments.filter((segment) => segment.type === 'tool');
    expect(tools).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'search_knowledge_base(query=one)',
        result: 'result-one',
        raw: 'search_knowledge_base(query=one)\nresult-one',
      },
      {
        type: 'tool',
        id: '2',
        state: 'done',
        call: 'search_knowledge_base(query=two)',
        result: 'result-two',
        raw: 'search_knowledge_base(query=two)\nresult-two',
      },
      {
        type: 'tool',
        id: '3',
        state: 'done',
        call: 'search_knowledge_base(query=three)',
        result: 'result-three',
        raw: 'search_knowledge_base(query=three)\nresult-three',
      },
    ]);
  });

  test('parses tool when truncated code block spans across </tool> into assistant text', () => {
    // Unbalanced ``` inside tool result — no closing ``` before </tool>.
    // The fenced-code regex matches from that ``` across </tool> to the
    // closing ``` in the assistant text.  The fix must not mask </tool>.
    const input = [
      '<tool id="1" state="done">search(query=test)',
      'Result: ```python\nimport foo\nfrom bar impo…</tool>',
      '',
      'Here is the answer:',
      '',
      '```python',
      'print("hello")',
      '```',
    ].join('\n');

    const segments = parseToolTags(input);
    const tools = segments.filter((s) => s.type === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      type: 'tool',
      id: '1',
      state: 'done',
      call: 'search(query=test)',
    });
    // The result should contain the truncated code content
    expect(tools[0].result).toContain('```python');
    expect(tools[0].result).toContain('import foo');

    const texts = segments.filter((s) => s.type === 'text');
    // The assistant text after </tool> should be preserved
    expect(texts.some((t) => t.text.includes('Here is the answer'))).toBe(true);
  });

  test('parses tool when truncated code block is followed by another tool then assistant code', () => {
    // Truncated ``` in tool 1, followed by tool 2, then assistant code block.
    // The fenced-code regex match spans across </tool> and <tool>, hitting
    // the existing openIdx check.  Verify both tools parse correctly.
    const input = [
      '<tool id="1" state="done">search(query=one)',
      'Result: ```python\nimport foo…</tool>',
      '',
      '<tool id="2" state="done">search(query=two)',
      'result-two</tool>',
      '',
      'Summary:',
      '',
      '```python',
      'print("done")',
      '```',
    ].join('\n');

    const segments = parseToolTags(input);
    const tools = segments.filter((s) => s.type === 'tool');
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ id: '1', call: 'search(query=one)' });
    expect(tools[1]).toMatchObject({ id: '2', call: 'search(query=two)', result: 'result-two' });

    const texts = segments.filter((s) => s.type === 'text');
    expect(texts.some((t) => t.text.includes('Summary'))).toBe(true);
  });

  test('keeps unmatched start tool calls', () => {
    const segments = parseToolTags(
      [
        '<tool id="1" state="start">search_knowledge_base(query=one)</tool>',
        '<tool id="1" state="done">search_knowledge_base(query=one)\nresult-one</tool>',
        '<tool id="2" state="start">search_knowledge_base(query=two)</tool>',
      ].join('\n\n'),
    );

    const tools = segments.filter((segment) => segment.type === 'tool');
    expect(tools).toEqual([
      {
        type: 'tool',
        id: '1',
        state: 'done',
        call: 'search_knowledge_base(query=one)',
        result: 'result-one',
        raw: 'search_knowledge_base(query=one)\nresult-one',
      },
      {
        type: 'tool',
        id: '2',
        state: 'start',
        call: 'search_knowledge_base(query=two)',
        result: null,
        raw: 'search_knowledge_base(query=two)',
      },
    ]);
  });
});
