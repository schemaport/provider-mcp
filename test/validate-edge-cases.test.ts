/**
 * Coverage for protocol-validation branches the main suite does not reach.
 *
 * Nothing here describes new behaviour — every assertion is against what
 * `validate.ts` already does. These are the cases a future change is most
 * likely to break silently: the optional-field type checks, the numeric edges
 * of `ttlMs`, and the path prefixes that make a validation error findable.
 */

import { describe, expect, it } from 'vitest';

import { classifyRootType } from '../src/check.js';
import { validateMcpTool, validateToolsListResult } from '../src/validate.js';

const minimal = { name: 'ok', inputSchema: { type: 'object' } };
const tool = (extra: Record<string, unknown>) => ({ ...minimal, ...extra });
const listResult = (extra: Record<string, unknown>) => ({
  resultType: 'complete',
  tools: [],
  ttlMs: 0,
  cacheScope: 'public',
  ...extra,
});

describe('validateMcpTool: optional field types', () => {
  it('rejects a non-string title', () => {
    expect(validateMcpTool(tool({ title: 7 })).errors).toEqual([
      'tool.title: must be a string when present.',
    ]);
  });

  it('rejects a non-string inputSchema.$schema', () => {
    const { errors } = validateMcpTool(tool({ inputSchema: { type: 'object', $schema: 2020 } }));

    expect(errors).toEqual(['tool.inputSchema.$schema: must be a string when present.']);
  });

  it('rejects a non-string outputSchema.$schema', () => {
    const { errors } = validateMcpTool(tool({ outputSchema: { $schema: false } }));

    expect(errors).toEqual(['tool.outputSchema.$schema: must be a string when present.']);
  });

  it('rejects a non-object outputSchema', () => {
    expect(validateMcpTool(tool({ outputSchema: 'string' })).errors).toEqual([
      'tool.outputSchema: must be a JSON Schema object when present.',
    ]);
  });

  it('accepts an outputSchema with a string $schema', () => {
    const value = tool({
      outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'array' },
    });

    expect(validateMcpTool(value).valid).toBe(true);
  });

  it('rejects a non-string annotations.title', () => {
    expect(validateMcpTool(tool({ annotations: { title: [] } })).errors).toEqual([
      'tool.annotations.title: must be a string when present.',
    ]);
  });

  it('reports each bad annotation hint separately', () => {
    const { errors } = validateMcpTool(
      tool({ annotations: { readOnlyHint: 'yes', openWorldHint: 1 } }),
    );

    expect(errors).toEqual([
      'tool.annotations.readOnlyHint: must be a boolean when present.',
      'tool.annotations.openWorldHint: must be a boolean when present.',
    ]);
  });
});

describe('validateMcpTool: icons', () => {
  it('rejects a non-object entry', () => {
    expect(validateMcpTool(tool({ icons: ['https://example.com/i.png'] })).errors).toEqual([
      'tool.icons[0]: must be a JSON object.',
    ]);
  });

  it('rejects an empty src distinctly from a missing one', () => {
    expect(validateMcpTool(tool({ icons: [{ src: '' }] })).errors).toEqual([
      'tool.icons[0].src: must not be empty.',
    ]);
    expect(validateMcpTool(tool({ icons: [{}] })).errors).toEqual([
      'tool.icons[0].src: is required and must be a string.',
    ]);
  });

  it('rejects a non-string mimeType', () => {
    expect(validateMcpTool(tool({ icons: [{ src: 'a', mimeType: 1 }] })).errors).toEqual([
      'tool.icons[0].mimeType: must be a string when present.',
    ]);
  });

  it('rejects sizes that are not an array of strings', () => {
    expect(validateMcpTool(tool({ icons: [{ src: 'a', sizes: '48x48' }] })).errors).toEqual([
      'tool.icons[0].sizes: must be an array of strings when present.',
    ]);
    expect(validateMcpTool(tool({ icons: [{ src: 'a', sizes: [48] }] })).errors).toEqual([
      'tool.icons[0].sizes: must be an array of strings when present.',
    ]);
  });

  it('accepts an empty icons array', () => {
    expect(validateMcpTool(tool({ icons: [] })).valid).toBe(true);
  });

  it('indexes each bad icon, so the message points at the right one', () => {
    const { errors } = validateMcpTool(
      tool({ icons: [{ src: 'ok' }, { src: '' }, { src: 'ok', theme: 'sepia' }] }),
    );

    expect(errors).toEqual([
      'tool.icons[1].src: must not be empty.',
      'tool.icons[2].theme: must be "light" or "dark" when present.',
    ]);
  });
});

describe('validateMcpTool: paths', () => {
  it('defaults the path prefix to `tool`', () => {
    expect(validateMcpTool({}).errors[0]).toMatch(/^tool\.name:/);
  });

  it('uses a caller-supplied prefix throughout', () => {
    const { errors } = validateMcpTool({ name: 'x' }, 'result.tools[3]');

    expect(errors).toEqual(['result.tools[3].inputSchema: is required and must be a JSON Schema object.']);
  });

  it('reports the prefix alone when the value is not an object', () => {
    expect(validateMcpTool(null, 'somewhere').errors).toEqual(['somewhere: must be a JSON object.']);
  });

  it('treats an array as not an object', () => {
    expect(validateMcpTool([]).valid).toBe(false);
  });
});

describe('validateToolsListResult: numeric and boundary cases', () => {
  it('accepts ttlMs of exactly zero', () => {
    expect(validateToolsListResult(listResult({ ttlMs: 0 })).valid).toBe(true);
  });

  it('rejects a non-finite ttlMs', () => {
    for (const ttlMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateToolsListResult(listResult({ ttlMs })).errors).toEqual([
        'result.ttlMs: must be a finite number >= 0.',
      ]);
    }
  });

  it('distinguishes a missing ttlMs from an invalid one', () => {
    const missing = listResult({});
    delete (missing as Record<string, unknown>)['ttlMs'];

    expect(validateToolsListResult(missing).errors).toEqual([
      'result.ttlMs: is required and must be a number of milliseconds >= 0.',
    ]);
  });

  it('rejects a missing cacheScope distinctly from an unknown one', () => {
    const missing = listResult({});
    delete (missing as Record<string, unknown>)['cacheScope'];

    expect(validateToolsListResult(missing).errors).toEqual([
      'result.cacheScope: is required and must be "public" or "private".',
    ]);
    expect(validateToolsListResult(listResult({ cacheScope: 'shared' })).errors).toEqual([
      'result.cacheScope: must be "public" or "private".',
    ]);
  });

  it('rejects a non-object _meta on the result', () => {
    expect(validateToolsListResult(listResult({ _meta: [] })).errors).toEqual([
      'result._meta: must be a JSON object when present.',
    ]);
  });

  it('reports every malformed tool in the array, each at its own index', () => {
    const { errors } = validateToolsListResult(
      listResult({ tools: [minimal, { name: 'no_schema' }, {}] }),
    );

    expect(errors).toEqual([
      'result.tools[1].inputSchema: is required and must be a JSON Schema object.',
      'result.tools[2].name: is required and must be a string.',
      'result.tools[2].inputSchema: is required and must be a JSON Schema object.',
    ]);
  });

  it('honours a caller-supplied path prefix', () => {
    expect(validateToolsListResult(null, 'response.result').errors).toEqual([
      'response.result: must be a JSON object.',
    ]);
  });
});

describe('classifyRootType', () => {
  it.each([
    [{ type: 'object' }, 'literal-object'],
    [{}, 'missing'],
    [{ properties: {} }, 'missing'],
    [{ type: ['object'] }, 'array-object-only'],
    [{ type: ['object', 'null'] }, 'union-with-object'],
    [{ type: ['null', 'object'] }, 'union-with-object'],
    [{ type: 'string' }, 'not-object'],
    [{ type: ['string', 'null'] }, 'not-object'],
    [{ type: [] }, 'not-object'],
  ])('classifies %j as %s', (schema, expected) => {
    expect(classifyRootType(schema)).toBe(expected);
  });
});
