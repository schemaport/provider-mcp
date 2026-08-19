import { describe, expect, it } from 'vitest';

import { mcpProvider, validateMcpTool, validateToolsListResult } from '../src/index.js';
import { toolsListResult } from './fixtures.js';

const tool = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'get_weather',
  inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
  ...overrides,
});

const result = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...toolsListResult,
  ...overrides,
});

describe('validateMcpTool — accepts', () => {
  it('the minimal required shape', () => {
    expect(validateMcpTool(tool())).toEqual({ valid: true, errors: [] });
  });

  it('every optional field populated', () => {
    expect(
      validateMcpTool(
        tool({
          title: 'Weather Information Provider',
          description: 'Get current weather',
          outputSchema: { type: 'array', items: { type: 'string' } },
          annotations: {
            title: 'Weather',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
          icons: [{ src: 'https://example.com/i.png', mimeType: 'image/png', sizes: ['48x48'], theme: 'dark' }],
          _meta: { 'com.example/traceId': 'abc' },
        }),
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  it('unknown top-level keys, because Tool is an open object', () => {
    expect(validateMcpTool(tool({ 'com.example/extension': { anything: true } })).valid).toBe(true);
  });

  it('a non-object outputSchema, which the spec explicitly allows', () => {
    expect(validateMcpTool(tool({ outputSchema: { type: 'string' } })).valid).toBe(true);
  });

  it('a name that violates SHOULD-level naming guidance', () => {
    // Naming guidance is a SHOULD, so it is a check() rule, not a shape error.
    const value = tool({ name: 'refund/order:v2' });
    expect(validateMcpTool(value).valid).toBe(true);
    expect(mcpProvider.check({ name: 'refund/order:v2', inputSchema: { type: 'object' } })).not
      .toEqual([]);
  });
});

describe('validateMcpTool — rejects', () => {
  it.each([
    ['null', null],
    ['a string', 'get_weather'],
    ['an array', []],
  ])('%s', (_label, value) => {
    expect(validateMcpTool(value)).toEqual({
      valid: false,
      errors: ['tool: must be a JSON object.'],
    });
  });

  it('a missing name', () => {
    const { errors } = validateMcpTool({ inputSchema: { type: 'object' } });
    expect(errors).toEqual(['tool.name: is required and must be a string.']);
  });

  it('an empty name', () => {
    expect(validateMcpTool(tool({ name: '' })).errors).toEqual(['tool.name: must not be empty.']);
  });

  it('a non-string description', () => {
    expect(validateMcpTool(tool({ description: 42 })).errors).toEqual([
      'tool.description: must be a string when present.',
    ]);
  });

  it('a missing inputSchema', () => {
    expect(validateMcpTool({ name: 'x' }).errors).toEqual([
      'tool.inputSchema: is required and must be a JSON Schema object.',
    ]);
  });

  it('an inputSchema that is not an object', () => {
    expect(validateMcpTool(tool({ inputSchema: true })).errors).toEqual([
      'tool.inputSchema: must be a JSON Schema object.',
    ]);
  });

  it('an inputSchema whose type is not "object"', () => {
    expect(validateMcpTool(tool({ inputSchema: { type: 'string' } })).errors).toEqual([
      'tool.inputSchema.type: must be the literal string "object"; tool arguments are always a JSON object.',
    ]);
  });

  it('an inputSchema whose type is ["object"]', () => {
    expect(validateMcpTool(tool({ inputSchema: { type: ['object'] } })).valid).toBe(false);
  });

  it('a non-object annotations', () => {
    expect(validateMcpTool(tool({ annotations: 'read-only' })).errors).toEqual([
      'tool.annotations: must be a JSON object when present.',
    ]);
  });

  it('a non-boolean annotation hint', () => {
    expect(validateMcpTool(tool({ annotations: { readOnlyHint: 'yes' } })).errors).toEqual([
      'tool.annotations.readOnlyHint: must be a boolean when present.',
    ]);
  });

  it('icons that are not an array', () => {
    expect(validateMcpTool(tool({ icons: { src: 'x' } })).errors).toEqual([
      'tool.icons: must be an array when present.',
    ]);
  });

  it('an icon without a src', () => {
    expect(validateMcpTool(tool({ icons: [{ mimeType: 'image/png' }] })).errors).toEqual([
      'tool.icons[0].src: is required and must be a string.',
    ]);
  });

  it('an icon with an unknown theme', () => {
    expect(validateMcpTool(tool({ icons: [{ src: 'x', theme: 'sepia' }] })).errors).toEqual([
      'tool.icons[0].theme: must be "light" or "dark" when present.',
    ]);
  });

  it('a non-object _meta', () => {
    expect(validateMcpTool(tool({ _meta: [] })).errors).toEqual([
      'tool._meta: must be a JSON object when present.',
    ]);
  });

  it('reports every problem at once', () => {
    expect(validateMcpTool({ name: 1, description: 2, inputSchema: 3 }).errors).toHaveLength(3);
  });
});

describe('validateToolsListResult — accepts', () => {
  it('a minimal 2026-07-28 result', () => {
    expect(validateToolsListResult(toolsListResult)).toEqual({ valid: true, errors: [] });
  });

  it('an empty tool list', () => {
    expect(validateToolsListResult(result({ tools: [] })).valid).toBe(true);
  });

  it('a paginated, privately cacheable result', () => {
    expect(
      validateToolsListResult(result({ nextCursor: 'abc', cacheScope: 'private', ttlMs: 0 })).valid,
    ).toBe(true);
  });

  it('unknown extra keys and _meta', () => {
    expect(
      validateToolsListResult(
        result({ _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'x', version: '1' } } }),
      ).valid,
    ).toBe(true);
  });
});

describe('validateToolsListResult — rejects', () => {
  it.each([
    ['null', null],
    ['an array', []],
    ['a number', 7],
  ])('%s', (_label, value) => {
    expect(validateToolsListResult(value)).toEqual({
      valid: false,
      errors: ['result: must be a JSON object.'],
    });
  });

  it('a 2025-06-18 shaped result, which lacks resultType, ttlMs and cacheScope', () => {
    const legacy = { tools: toolsListResult.tools };
    expect(validateToolsListResult(legacy).errors).toEqual([
      'result.resultType: is required and must be "complete".',
      'result.ttlMs: is required and must be a number of milliseconds >= 0.',
      'result.cacheScope: is required and must be "public" or "private".',
    ]);
  });

  it('a wrong resultType', () => {
    expect(validateToolsListResult(result({ resultType: 'input_required' })).errors).toEqual([
      'result.resultType: must be "complete" for a tools/list result, got "input_required".',
    ]);
  });

  it('a missing tools array', () => {
    const { tools: _tools, ...rest } = toolsListResult;
    expect(validateToolsListResult(rest).errors).toEqual([
      'result.tools: is required and must be an array.',
    ]);
  });

  it('a tools value that is not an array', () => {
    expect(validateToolsListResult(result({ tools: {} })).errors).toEqual([
      'result.tools: must be an array.',
    ]);
  });

  it('a malformed tool inside the array, with an indexed path', () => {
    expect(validateToolsListResult(result({ tools: [{ name: 'ok' }] })).errors).toEqual([
      'result.tools[0].inputSchema: is required and must be a JSON Schema object.',
    ]);
  });

  it('a negative ttlMs', () => {
    expect(validateToolsListResult(result({ ttlMs: -1 })).errors).toEqual([
      'result.ttlMs: must be a finite number >= 0.',
    ]);
  });

  it('a non-numeric ttlMs', () => {
    expect(validateToolsListResult(result({ ttlMs: '300000' })).errors).toEqual([
      'result.ttlMs: must be a finite number >= 0.',
    ]);
  });

  it('an unknown cacheScope', () => {
    expect(validateToolsListResult(result({ cacheScope: 'shared' })).errors).toEqual([
      'result.cacheScope: must be "public" or "private".',
    ]);
  });

  it('a non-string nextCursor', () => {
    expect(validateToolsListResult(result({ nextCursor: 3 })).errors).toEqual([
      'result.nextCursor: must be a string when present.',
    ]);
  });

  it('the JSON-RPC envelope, because it validates the bare result object', () => {
    expect(validateToolsListResult({ jsonrpc: '2.0', id: 1, result: toolsListResult }).valid).toBe(
      false,
    );
  });
});

describe('validation helpers are pure', () => {
  it('return a fresh, stable result each call', () => {
    const value = tool({ description: 9 });
    const first = validateMcpTool(value);
    const second = validateMcpTool(value);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
