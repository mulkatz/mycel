import { describe, it, expect } from 'vitest';
import { extractJson } from './json-extraction.js';

describe('extractJson', () => {
  it('should parse clean JSON directly', () => {
    const result = extractJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should parse JSON with leading/trailing whitespace', () => {
    const result = extractJson('  \n  {"key": "value"}  \n  ');
    expect(result).toEqual({ key: 'value' });
  });

  it('should extract JSON from markdown code block with json tag', () => {
    const input = '```json\n{"categoryId": "history", "confidence": 0.9}\n```';
    const result = extractJson(input);
    expect(result).toEqual({ categoryId: 'history', confidence: 0.9 });
  });

  it('should extract JSON from markdown code block without json tag', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = extractJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('should extract JSON from text with leading explanation', () => {
    const input = 'Here is the result:\n{"categoryId": "history", "confidence": 0.85}';
    const result = extractJson(input);
    expect(result).toEqual({ categoryId: 'history', confidence: 0.85 });
  });

  it('should handle nested braces correctly', () => {
    const input = 'Result: {"data": {"nested": {"deep": true}}, "count": 1}';
    const result = extractJson(input);
    expect(result).toEqual({ data: { nested: { deep: true } }, count: 1 });
  });

  it('should handle braces inside string values', () => {
    const input = '{"message": "use {braces} in text", "ok": true}';
    const result = extractJson(input);
    expect(result).toEqual({ message: 'use {braces} in text', ok: true });
  });

  it('should extract JSON arrays', () => {
    const input = 'The array: [1, 2, 3]';
    const result = extractJson(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should prefer objects over arrays when object comes first', () => {
    const input = '{"items": [1, 2]}';
    const result = extractJson(input);
    expect(result).toEqual({ items: [1, 2] });
  });

  it('should throw SyntaxError for content with no JSON', () => {
    expect(() => extractJson('no json here')).toThrow(SyntaxError);
  });

  it('should throw SyntaxError for empty string', () => {
    expect(() => extractJson('')).toThrow(SyntaxError);
  });

  it('should handle escaped quotes in strings', () => {
    const input = '{"text": "he said \\"hello\\"", "ok": true}';
    const result = extractJson(input);
    expect(result).toEqual({ text: 'he said "hello"', ok: true });
  });
});
