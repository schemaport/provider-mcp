import {
  constraintTool,
  minimalTool,
  nestedTool,
  openMapTool,
  refundOrderTool,
  unionTool,
} from '@schemaport/core';
import { describe, expect, it } from 'vitest';

import {
  MCP_DIAGNOSTIC_CODES,
  MCP_TRANSFORMATION_CODES,
  mcpProvider,
  validateMcpTool,
} from '../src/index.js';
import type { McpTool } from '../src/index.js';
import {
  arrayObjectTypeTool,
  danglingRefTool,
  duplicateHeaderTool,
  missingTypeTool,
  notObjectTool,
  unionRootTypeTool,
  validHeaderTool,
} from './fixtures.js';

const ALL_FIXTURES = [
  refundOrderTool,
  minimalTool,
  nestedTool,
  openMapTool,
  unionTool,
  constraintTool,
  validHeaderTool,
];

describe('compile()', () => {
  it('emits the canonical schema verbatim, with no transformations', () => {
    const result = mcpProvider.compile(refundOrderTool);
    expect(result.ok).toBe(true);
    expect(result.transformations).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.output).toEqual({
      name: 'refund_order',
      description: 'Refunds all or part of an order',
      inputSchema: refundOrderTool.inputSchema,
    });
  });

  it('omits `description` when the canonical tool has none', () => {
    const result = mcpProvider.compile(minimalTool);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.output as object)).toEqual(['name', 'inputSchema']);
  });

  it('preserves $defs, $ref, composition and every validation keyword', () => {
    const result = mcpProvider.compile(nestedTool);
    const output = result.output as McpTool;
    expect(output.inputSchema).toEqual(nestedTool.inputSchema);
    expect(mcpProvider.compile(unionTool).output).toEqual({
      name: 'set_limit',
      description: 'Sets a numeric limit or removes it',
      inputSchema: unionTool.inputSchema,
    });
  });

  it('never mutates the canonical tool', () => {
    const before = JSON.stringify(missingTypeTool);
    mcpProvider.compile(missingTypeTool);
    expect(JSON.stringify(missingTypeTool)).toBe(before);
  });

  it('produces no lossy transformation for any fixture', () => {
    for (const tool of [...ALL_FIXTURES, missingTypeTool, arrayObjectTypeTool, unionRootTypeTool]) {
      const result = mcpProvider.compile(tool);
      expect(result.transformations.filter((item) => item.lossy)).toEqual([]);
    }
  });
});

describe('compile() root-type repairs', () => {
  it('adds `"type": "object"` and drops the error it worked around', () => {
    const result = mcpProvider.compile(missingTypeTool);
    expect(result.ok).toBe(true);
    expect(result.transformations).toEqual([
      {
        code: MCP_TRANSFORMATION_CODES.addedInputSchemaType,
        path: 'inputSchema.type',
        detail: 'Added `"type": "object"` at the root of `inputSchema`, which MCP requires.',
        lossy: false,
      },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.output).toEqual({
      name: 'no_root_type',
      description: 'Root schema omits `type`',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    });
  });

  it('normalizes `["object"]` to the literal string', () => {
    const result = mcpProvider.compile(arrayObjectTypeTool);
    expect(result.ok).toBe(true);
    expect(result.transformations.map((item) => item.code)).toEqual([
      MCP_TRANSFORMATION_CODES.normalizedInputSchemaType,
    ]);
    expect((result.output as McpTool).inputSchema.type).toBe('object');
  });

  it('narrows a union root type and keeps the warning in the result', () => {
    const result = mcpProvider.compile(unionRootTypeTool);
    expect(result.ok).toBe(true);
    expect(result.transformations.map((item) => item.code)).toEqual([
      MCP_TRANSFORMATION_CODES.narrowedInputSchemaType,
    ]);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      MCP_DIAGNOSTIC_CODES.inputSchemaTypeUnion,
    ]);
    expect((result.output as McpTool).inputSchema.type).toBe('object');
  });

  it('refuses a root schema that cannot hold arguments', () => {
    const result = mcpProvider.compile(notObjectTool);
    expect(result.ok).toBe(false);
    expect(result.output).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      MCP_DIAGNOSTIC_CODES.inputSchemaNotObject,
    ]);
  });

  it('refuses a tool with a colliding x-mcp-header', () => {
    const result = mcpProvider.compile(duplicateHeaderTool);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain(
      MCP_DIAGNOSTIC_CODES.xMcpHeaderDuplicate,
    );
  });

  it('still compiles when a $ref cannot be resolved, keeping the warning', () => {
    const result = mcpProvider.compile(danglingRefTool);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      MCP_DIAGNOSTIC_CODES.unresolvableRef,
    ]);
    expect((result.output as McpTool).inputSchema).toEqual(danglingRefTool.inputSchema);
  });
});

describe('determinism', () => {
  it.each([
    ...ALL_FIXTURES,
    missingTypeTool,
    arrayObjectTypeTool,
    unionRootTypeTool,
    danglingRefTool,
  ])('compiles $name byte-identically twice', (tool) => {
    const first = mcpProvider.compile(tool);
    const second = mcpProvider.compile(tool);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('is unaffected by allowLossy, because nothing MCP does is lossy', () => {
    for (const tool of ALL_FIXTURES) {
      expect(JSON.stringify(mcpProvider.compile(tool, { allowLossy: true }))).toBe(
        JSON.stringify(mcpProvider.compile(tool)),
      );
    }
  });
});

describe('round trip', () => {
  it.each([...ALL_FIXTURES, missingTypeTool, arrayObjectTypeTool, unionRootTypeTool])(
    'compiled output of $name validates as an MCP Tool',
    (tool) => {
      const result = mcpProvider.compile(tool);
      expect(result.ok).toBe(true);
      expect(validateMcpTool(result.output)).toEqual({ valid: true, errors: [] });
    },
  );

  it('compiled output can be dropped straight into a tools/list result', () => {
    const compiled = ALL_FIXTURES.map((tool) => mcpProvider.compile(tool).output);
    expect(
      validateMcpTool(compiled[0]).valid && compiled.every((out) => validateMcpTool(out).valid),
    ).toBe(true);
  });
});
