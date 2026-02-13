export type ToolSegment =
  | { type: 'text'; text: string }
  | { type: 'tool'; call: string; result: string | null; raw: string };

const TOOL_OPEN_TAG = '<tool>';
const TOOL_CLOSE_TAG = '</tool>';
const TOOL_GROUP_OPEN_TAG = '<tool-group>';
const TOOL_GROUP_CLOSE_TAG = '</tool-group>';

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

const parseRange = (text: string, start: number, end: number): ToolSegment[] => {
  const segments: ToolSegment[] = [];
  let cursor = start;

  while (cursor < end) {
    const nextToolIndex = text.indexOf(TOOL_OPEN_TAG, cursor);
    const nextGroupIndex = text.indexOf(TOOL_GROUP_OPEN_TAG, cursor);
    const hasTool = nextToolIndex !== -1 && nextToolIndex < end;
    const hasGroup = nextGroupIndex !== -1 && nextGroupIndex < end;

    if (!hasTool && !hasGroup) {
      pushTextSegment(segments, text.slice(cursor, end));
      break;
    }

    let nextIndex = -1;
    let nextType: 'tool' | 'group' = 'tool';

    if (hasTool && hasGroup) {
      if (nextToolIndex <= nextGroupIndex) {
        nextIndex = nextToolIndex;
        nextType = 'tool';
      } else {
        nextIndex = nextGroupIndex;
        nextType = 'group';
      }
    } else if (hasTool) {
      nextIndex = nextToolIndex;
      nextType = 'tool';
    } else {
      nextIndex = nextGroupIndex;
      nextType = 'group';
    }

    if (nextIndex > cursor) {
      pushTextSegment(segments, text.slice(cursor, nextIndex));
    }

    if (nextType === 'tool') {
      const bodyStart = nextIndex + TOOL_OPEN_TAG.length;
      const closeIndex = text.indexOf(TOOL_CLOSE_TAG, bodyStart);

      if (closeIndex === -1 || closeIndex > end) {
        pushTextSegment(segments, text.slice(nextIndex, end));
        break;
      }

      const raw = text.slice(bodyStart, closeIndex);
      const newlineIndex = raw.indexOf('\n');
      const call = decodeHtmlEntities(newlineIndex === -1 ? raw : raw.slice(0, newlineIndex));
      const result =
        newlineIndex === -1 ? null : decodeHtmlEntities(raw.slice(newlineIndex + 1));

      segments.push({
        type: 'tool',
        call,
        result,
        raw,
      });

      cursor = closeIndex + TOOL_CLOSE_TAG.length;
      continue;
    }

    const groupBodyStart = nextIndex + TOOL_GROUP_OPEN_TAG.length;
    const groupCloseIndex = text.indexOf(TOOL_GROUP_CLOSE_TAG, groupBodyStart);

    if (groupCloseIndex === -1 || groupCloseIndex > end) {
      pushTextSegment(segments, text.slice(nextIndex, end));
      break;
    }

    const groupSegments = parseRange(text, groupBodyStart, groupCloseIndex);
    for (const segment of groupSegments) {
      if (segment.type === 'text' && segment.text.trim().length === 0) {
        continue;
      }
      if (segment.type === 'text') {
        pushTextSegment(segments, segment.text);
      } else {
        segments.push(segment);
      }
    }

    cursor = groupCloseIndex + TOOL_GROUP_CLOSE_TAG.length;
  }

  return segments;
};

/**
 * Parse assistant text into ordered segments of plain text and tool blocks.
 */
export function parseToolTags(text: string): ToolSegment[] {
  if (text.length === 0) {
    return [{ type: 'text', text: '' }];
  }

  const segments = parseRange(text, 0, text.length);
  if (segments.length === 0) {
    return [{ type: 'text', text }];
  }

  return segments;
}
