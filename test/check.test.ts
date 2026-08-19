import {
  constraintTool,
  minimalTool,
  nestedTool,
  openMapTool,
  refundOrderTool,
  unionTool,
} from '@schemaport/core';
import type { Diagnostic } from '@schemaport/core';
import { describe, expect, it } from 'vitest';

import { MCP_DIAGNOSTIC_CODES, mcpProvider } from '../src/index.js';
import {
  anchorRefTool,
  arrayObjectTypeTool,
  badNameTool,
  danglingRefTool,
  draft07Tool,
  draft202012Tool,
  duplicateHeaderTool,
  externalRefTool,
  invalidHeaderTool,
  longNameTool,
  missingTypeTool,
  notObjectTool,
  nullableTool,
  numberHeaderTool,
  resolvableRefTool,
  unionRootTypeTool,
  validHeaderTool,
} from './fixtures.js';

const codes = (diagnostics: Diagnostic[]): string[] => diagnostics.map((item) => item.code);

const only = (diagnostics: Diagnostic[], code: string): Diagnostic => {
  const found = diagnostics.filter((item) => item.code === code);
  expect(found, `expected exactly one ${code}`).toHaveLength(1);
  return found[0] as Diagnostic;
};

describe('check() on compatible tools', () => {
  it.each([
    ['refund_order', refundOrderTool],
    ['ping', minimalTool],
    ['create_ticket', nestedTool],
    ['tag_resource', openMapTool],
    ['set_limit', unionTool],
    ['schedule_job', constraintTool],
  ])('reports nothing for the shared %s fixture', (_name, tool) => {
    expect(mcpProvider.check(tool)).toEqual([]);
  });

  it('reports nothing for a resolvable local $ref', () => {
    expect(mcpProvider.check(resolvableRefTool)).toEqual([]);
  });

  it('reports nothing for a $ref resolved through an $anchor', () => {
    expect(mcpProvider.check(anchorRefTool)).toEqual([]);
  });

  it('reports nothing for an explicit 2020-12 dialect', () => {
    expect(mcpProvider.check(draft202012Tool)).toEqual([]);
  });

  it('reports nothing for a valid x-mcp-header', () => {
    expect(mcpProvider.check(validHeaderTool)).toEqual([]);
  });
});

describe('mcp/tool-name-characters', () => {
  it('warns on characters outside the recommended set', () => {
    const found = only(mcpProvider.check(badNameTool), MCP_DIAGNOSTIC_CODES.toolNameCharacters);
    expect(found.severity).toBe('warning');
    expect(found.path).toBe('name');
    expect(found.compile.supported).toBe(false);
    expect(found.docsUrl).toContain('#tool-names');
  });
});

describe('mcp/tool-name-length', () => {
  it('warns on a name longer than 128 characters', () => {
    const found = only(mcpProvider.check(longNameTool), MCP_DIAGNOSTIC_CODES.toolNameLength);
    expect(found.severity).toBe('warning');
    expect(found.path).toBe('name');
    expect(found.compile.supported).toBe(false);
  });

  it('does not warn at exactly 128 characters', () => {
    const tool = { ...longNameTool, name: 'a'.repeat(128) };
    expect(codes(mcpProvider.check(tool))).not.toContain(MCP_DIAGNOSTIC_CODES.toolNameLength);
  });
});

describe('root type rules', () => {
  it('mcp/input-schema-missing-type is an error compile can fix', () => {
    const found = only(
      mcpProvider.check(missingTypeTool),
      MCP_DIAGNOSTIC_CODES.inputSchemaMissingType,
    );
    expect(found.severity).toBe('error');
    expect(found.path).toBe('inputSchema.type');
    expect(found.compile).toEqual({
      supported: true,
      lossy: false,
      detail: 'Emits `"type": "object"` at the root of `inputSchema`.',
    });
  });

  it('mcp/input-schema-type-not-literal-object is an error compile can fix', () => {
    const found = only(
      mcpProvider.check(arrayObjectTypeTool),
      MCP_DIAGNOSTIC_CODES.inputSchemaTypeNotLiteralObject,
    );
    expect(found.severity).toBe('error');
    expect(found.compile.supported).toBe(true);
    expect(found.compile.lossy).toBe(false);
  });

  it('mcp/input-schema-type-union is a warning, because narrowing changes accepted inputs', () => {
    const found = only(
      mcpProvider.check(unionRootTypeTool),
      MCP_DIAGNOSTIC_CODES.inputSchemaTypeUnion,
    );
    expect(found.severity).toBe('warning');
    expect(found.compile.supported).toBe(true);
    expect(found.message).toContain('`null`');
  });

  it('mcp/input-schema-not-object is an error compile refuses', () => {
    const found = only(mcpProvider.check(notObjectTool), MCP_DIAGNOSTIC_CODES.inputSchemaNotObject);
    expect(found.severity).toBe('error');
    expect(found.compile.supported).toBe(false);
  });
});

describe('$ref rules', () => {
  it('mcp/unresolvable-ref warns on a dangling local pointer', () => {
    const found = only(mcpProvider.check(danglingRefTool), MCP_DIAGNOSTIC_CODES.unresolvableRef);
    expect(found.severity).toBe('warning');
    expect(found.path).toBe('inputSchema.properties.total.$ref');
    expect(found.compile.supported).toBe(false);
    expect(found.docsUrl).toContain('#ref-resolution');
  });

  it('mcp/external-ref warns on a network URI', () => {
    const found = only(mcpProvider.check(externalRefTool), MCP_DIAGNOSTIC_CODES.externalRef);
    expect(found.severity).toBe('warning');
    expect(found.path).toBe('inputSchema.properties.total.$ref');
    expect(found.compile.supported).toBe(false);
  });
});

describe('mcp/non-default-schema-dialect', () => {
  it('warns on a draft-07 dialect', () => {
    const found = only(
      mcpProvider.check(draft07Tool),
      MCP_DIAGNOSTIC_CODES.nonDefaultSchemaDialect,
    );
    expect(found.severity).toBe('warning');
    expect(found.path).toBe('inputSchema.$schema');
    expect(found.docsUrl).toContain('#json-schema-usage');
  });
});

describe('x-mcp-header rules', () => {
  it('mcp/x-mcp-header-invalid errors on a non-token value', () => {
    const found = only(
      mcpProvider.check(invalidHeaderTool),
      MCP_DIAGNOSTIC_CODES.xMcpHeaderInvalid,
    );
    expect(found.severity).toBe('error');
    expect(found.path).toBe('inputSchema.properties.region["x-mcp-header"]');
    expect(found.compile.supported).toBe(false);
  });

  it('mcp/x-mcp-header-duplicate errors on a case-insensitive collision', () => {
    const found = only(
      mcpProvider.check(duplicateHeaderTool),
      MCP_DIAGNOSTIC_CODES.xMcpHeaderDuplicate,
    );
    expect(found.severity).toBe('error');
    expect(found.compile.supported).toBe(false);
  });

  it('mcp/x-mcp-header-unsupported-type errors on a number property', () => {
    const found = only(
      mcpProvider.check(numberHeaderTool),
      MCP_DIAGNOSTIC_CODES.xMcpHeaderUnsupportedType,
    );
    expect(found.severity).toBe('error');
    expect(found.compile.supported).toBe(false);
  });
});

describe('mcp/nullable-keyword-ignored', () => {
  it('reports info for an OpenAPI-style nullable', () => {
    const found = only(
      mcpProvider.check(nullableTool),
      MCP_DIAGNOSTIC_CODES.nullableKeywordIgnored,
    );
    expect(found.severity).toBe('info');
    expect(found.path).toBe('inputSchema.properties.note.nullable');
  });
});

describe('determinism', () => {
  it('produces identical diagnostics across runs', () => {
    for (const tool of [duplicateHeaderTool, danglingRefTool, unionRootTypeTool, nullableTool]) {
      expect(JSON.stringify(mcpProvider.check(tool))).toBe(
        JSON.stringify(mcpProvider.check(tool)),
      );
    }
  });

  it('sorts diagnostics by severity, then path, then code', () => {
    const diagnostics = mcpProvider.check({
      name: 'kitchen/sink',
      inputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          shard: { type: 'number', 'x-mcp-header': 'Shard' },
          note: { type: 'string', nullable: true },
        },
      },
    });
    expect(codes(diagnostics)).toEqual([
      MCP_DIAGNOSTIC_CODES.xMcpHeaderUnsupportedType,
      MCP_DIAGNOSTIC_CODES.nonDefaultSchemaDialect,
      MCP_DIAGNOSTIC_CODES.toolNameCharacters,
      MCP_DIAGNOSTIC_CODES.nullableKeywordIgnored,
    ]);
  });

  it('stamps every diagnostic with the provider id and tool name', () => {
    for (const item of mcpProvider.check(duplicateHeaderTool)) {
      expect(item.providerId).toBe('mcp');
      expect(item.toolName).toBe(duplicateHeaderTool.name);
      expect(item.code.startsWith('mcp/')).toBe(true);
      expect(item.docsUrl).toBeTypeOf('string');
    }
  });
});
