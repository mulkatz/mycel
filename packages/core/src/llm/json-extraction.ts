/**
 * Extracts a JSON value from a string that may contain markdown code blocks
 * or other surrounding text.
 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();

  // 1. Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to fallback strategies
  }

  // 2. Extract from ```json ... ``` code blocks
  const codeBlockMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(trimmed);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Find first balanced { ... } or [ ... ]
  const braceResult = extractBalanced(trimmed, '{', '}');
  if (braceResult !== undefined) {
    return braceResult;
  }

  const bracketResult = extractBalanced(trimmed, '[', ']');
  if (bracketResult !== undefined) {
    return bracketResult;
  }

  throw new SyntaxError(`Failed to extract JSON from content: ${trimmed.slice(0, 100)}`);
}

function extractBalanced(text: string, open: string, close: string): unknown {
  const startIdx = text.indexOf(open);
  if (startIdx === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(startIdx, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}
