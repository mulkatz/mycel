export function buildEmbeddingText(entry: {
  readonly categoryId: string;
  readonly title: string;
  readonly content: string;
  readonly structuredData: Record<string, unknown>;
  readonly tags: readonly string[];
}): string {
  const parts: string[] = [];

  if (entry.categoryId && entry.categoryId !== '_uncategorized') {
    parts.push(entry.categoryId);
  }

  parts.push(entry.title);
  parts.push(entry.content);

  const structuredParts = Object.entries(entry.structuredData)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);

  if (structuredParts.length > 0) {
    parts.push(structuredParts.join('. '));
  }

  if (entry.tags.length > 0) {
    parts.push(entry.tags.join(', '));
  }

  return parts.join('. ');
}

export function buildInputEmbeddingText(userInput: string, categoryId?: string): string {
  if (categoryId && categoryId !== '_uncategorized') {
    return `${categoryId}. ${userInput}`;
  }
  return userInput;
}
