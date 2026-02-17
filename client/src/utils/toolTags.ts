export type ToolSegment =
  | { type: 'text'; text: string }
  | {
      type: 'tool';
      id: string;
      state: 'start' | 'done';
      call: string;
      result: string | null;
      raw: string;
    };

const TOOL_CLOSE_TAG = '</tool>';
const TOOL_TAG_PATTERN = /<tool(?=[\s>])[^>]*>[\s\S]*?<\/tool>/g;
const FENCED_CODE_PATTERN = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE_CODE_PATTERN = /(`+)([\s\S]*?)\1/g;
const TOOL_OPEN_WITH_REQUIRED_ATTRS_PATTERN =
  /<tool(?=[\s>])(?=[^>]*\bid="[^"]+")(?=[^>]*\bstate="(?:start|done)")[^>]*>/g;
const TOOL_CLOSE_TAG_PATTERN = /<\/tool>/g;
const TOOL_OPEN_SEARCH_PATTERN =
  /<tool(?=[\s>])(?=[^>]*\bid="[^"]+")(?=[^>]*\bstate="(?:start|done)")/;

const decodeHtmlEntities = (value: string): string => {
  if (!value.includes('&')) {
    return value;
  }

  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|#39);/g, (match, entity) => {
    if (entity === 'amp') {
      return '&';
    }
    if (entity === 'lt') {
      return '<';
    }
    if (entity === 'gt') {
      return '>';
    }
    if (entity === 'quot') {
      return '"';
    }
    if (entity === 'apos' || entity === '#39') {
      return "'";
    }

    if (!entity.startsWith('#')) {
      return match;
    }

    const isHex = entity.startsWith('#x');
    const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    if (!Number.isFinite(codePoint) || codePoint < 0) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match;
    }
  });
};

const pushTextSegment = (segments: ToolSegment[], text: string) => {
  if (text.length === 0) {
    return;
  }

  const previousSegment = segments[segments.length - 1];
  if (previousSegment?.type === 'text') {
    previousSegment.text += text;
    return;
  }

  segments.push({ type: 'text', text });
};

const isInsideToolResult = (text: string, index: number): boolean => {
  const prefix = text.slice(0, index);
  const openCount = (prefix.match(TOOL_OPEN_WITH_REQUIRED_ATTRS_PATTERN) ?? []).length;
  const closeCount = (prefix.match(TOOL_CLOSE_TAG_PATTERN) ?? []).length;
  return openCount > closeCount;
};

const maskCodeBlocks = (text: string): string => {
  const mask = (match: string, startIndex: number) => {
    // Don't mask "code blocks" that started inside a tool result.
    // Unbalanced backticks in tool content (e.g., truncated text ending with
    // ```python ...) cause the code-block regex to match across </tool> into
    // the next <tool>, hiding those tags from the tool-tag parser.
    // If the opening backticks start inside a tool result and the same
    // regex match crosses a real </tool> boundary into a following <tool ...>,
    // this is not a real markdown block in assistant text and should stay
    // unmasked so the parser can still see tool tags.
    if (!isInsideToolResult(text, startIndex)) {
      return ' '.repeat(match.length);
    }

    const closeIdx = match.indexOf('</tool>');
    if (closeIdx === -1) {
      return ' '.repeat(match.length);
    }

    const openIdx = match.search(TOOL_OPEN_SEARCH_PATTERN);
    if (openIdx !== -1 && closeIdx < openIdx) {
      return match;
    }

    return ' '.repeat(match.length);
  };
  const maskedFences = text.replace(FENCED_CODE_PATTERN, (match, offset: number) =>
    mask(match, offset),
  );
  return maskedFences.replace(
    INLINE_CODE_PATTERN,
    (match: string, _ticks: string, _content: string, offset: number) => mask(match, offset),
  );
};

const hasBalancedToolGroups = (text: string): boolean => {
  const openCount = (text.match(/<tool-group>/g) ?? []).length;
  const closeCount = (text.match(/<\/tool-group>/g) ?? []).length;
  return openCount === closeCount;
};

const removeStandaloneToolGroupLines = (text: string): string => {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '<tool-group>' && trimmed !== '</tool-group>';
    })
    .join('\n');
};

const parseSegments = (text: string): ToolSegment[] => {
  const segments: ToolSegment[] = [];
  const masked = maskCodeBlocks(text);
  let cursor = 0;
  let match: RegExpExecArray | null;

  TOOL_TAG_PATTERN.lastIndex = 0;
  while ((match = TOOL_TAG_PATTERN.exec(masked)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const rawMatch = text.slice(start, end);

    if (start > cursor) {
      pushTextSegment(segments, text.slice(cursor, start));
    }

    const openTagEnd = rawMatch.indexOf('>');
    if (openTagEnd === -1 || !rawMatch.endsWith(TOOL_CLOSE_TAG)) {
      pushTextSegment(segments, rawMatch);
      cursor = end;
      continue;
    }

    const openTag = rawMatch.slice(0, openTagEnd + 1);
    const idMatch = openTag.match(/\bid="([^"]+)"/);
    const stateMatch = openTag.match(/\bstate="(start|done)"/);
    const id = idMatch?.[1]?.trim() ?? '';
    const state = stateMatch?.[1] as 'start' | 'done' | undefined;

    if (!id || state == null) {
      pushTextSegment(segments, rawMatch);
      cursor = end;
      continue;
    }

    const body = rawMatch.slice(openTagEnd + 1, rawMatch.length - TOOL_CLOSE_TAG.length);
    const newlineIndex = body.indexOf('\n');
    const call = decodeHtmlEntities(newlineIndex === -1 ? body : body.slice(0, newlineIndex));
    const parsedResult =
      newlineIndex === -1 ? null : decodeHtmlEntities(body.slice(newlineIndex + 1));
    const result = state === 'start' ? null : (parsedResult ?? '');

    segments.push({
      type: 'tool',
      id,
      state,
      call,
      result,
      raw: body,
    });

    cursor = end;
  }

  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }

  return segments;
};

const collapsePendingCompletedDuplicates = (segments: ToolSegment[]): ToolSegment[] => {
  if (segments.length < 2) {
    return segments;
  }

  const firstIndexById = new Map<string, number>();
  const finalSegmentById = new Map<string, Extract<ToolSegment, { type: 'tool' }>>();

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment.type !== 'tool') {
      continue;
    }

    if (!firstIndexById.has(segment.id)) {
      firstIndexById.set(segment.id, index);
    }

    const previous = finalSegmentById.get(segment.id);
    if (previous == null) {
      finalSegmentById.set(segment.id, segment);
      continue;
    }

    if (segment.state === 'done' || previous.state !== 'done') {
      finalSegmentById.set(segment.id, segment);
    }
  }

  const collapsed: ToolSegment[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (segment.type === 'text') {
      pushTextSegment(collapsed, segment.text);
      continue;
    }

    if (firstIndexById.get(segment.id) !== index) {
      continue;
    }

    const finalSegment = finalSegmentById.get(segment.id);
    if (finalSegment == null) {
      continue;
    }

    collapsed.push(finalSegment);
  }

  return collapsed;
};

const removeWhitespaceOnlyTextSegments = (segments: ToolSegment[]): ToolSegment[] => {
  const filtered: ToolSegment[] = [];
  for (const segment of segments) {
    if (segment.type === 'text' && segment.text.trim().length === 0) {
      continue;
    }

    if (segment.type === 'text') {
      pushTextSegment(filtered, segment.text);
      continue;
    }

    filtered.push(segment);
  }

  return filtered;
};

/**
 * Parse assistant text into ordered segments of plain text and strict tool blocks.
 */
export function parseToolTags(text: string): ToolSegment[] {
  if (text.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  if (!hasBalancedToolGroups(text)) {
    return [{ type: 'text', text }];
  }

  const normalizedText = removeStandaloneToolGroupLines(text);
  const segments = removeWhitespaceOnlyTextSegments(
    collapsePendingCompletedDuplicates(parseSegments(normalizedText)),
  );
  if (segments.length === 0) {
    return [{ type: 'text', text }];
  }

  return segments;
}
