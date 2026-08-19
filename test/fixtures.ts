/**
 * Local fixtures for MCP-specific rules.
 *
 * The shared canonical fixtures (`refundOrderTool`, `nestedTool`, ...) come
 * from `@schemaport/core`. The ones here exercise MCP rules that no shared
 * fixture triggers, and several are deliberately not valid `CanonicalTool`
 * values by core's own `validateCanonicalTool` — they are constructed in
 * memory to prove the adapter still reports the right MCP diagnostic.
 */

import type { CanonicalTool } from '@schemaport/core';

/** `inputSchema` with no `type` at all. compile() adds `"type": "object"`. */
export const missingTypeTool: CanonicalTool = {
  name: 'no_root_type',
  description: 'Root schema omits `type`',
  inputSchema: {
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
};

/** `"type": ["object"]` — the right type, the wrong representation. */
export const arrayObjectTypeTool: CanonicalTool = {
  name: 'array_root_type',
  inputSchema: {
    type: ['object'],
    properties: { id: { type: 'string' } },
  },
};

/** `"type": ["object", "null"]` — compile narrows and check() warns. */
export const unionRootTypeTool: CanonicalTool = {
  name: 'union_root_type',
  inputSchema: {
    type: ['object', 'null'],
    properties: { id: { type: 'string' } },
  },
};

/** A root schema that cannot hold tool arguments at all. */
export const notObjectTool: CanonicalTool = {
  name: 'string_root_type',
  inputSchema: {
    type: 'string',
  },
};

/** A tool name using characters MCP does not recommend. */
export const badNameTool: CanonicalTool = {
  name: 'refund/order:v2',
  inputSchema: { type: 'object', properties: {} },
};

/** A tool name past the 128-character guidance. */
export const longNameTool: CanonicalTool = {
  name: `a${'b'.repeat(128)}`,
  inputSchema: { type: 'object', properties: {} },
};

/** A `$ref` that resolves inside the tool's own `$defs`. */
export const resolvableRefTool: CanonicalTool = {
  name: 'local_ref',
  inputSchema: {
    type: 'object',
    $defs: {
      Money: { type: 'object', properties: { amount: { type: 'number' } } },
    },
    properties: {
      total: { $ref: '#/$defs/Money' },
    },
    required: ['total'],
  },
};

/** A `$ref` that resolves through an `$anchor`. */
export const anchorRefTool: CanonicalTool = {
  name: 'anchor_ref',
  inputSchema: {
    type: 'object',
    $defs: {
      Money: { $anchor: 'money', type: 'object' },
    },
    properties: {
      total: { $ref: '#money' },
    },
  },
};

/** A local `$ref` pointing at a definition that does not exist. */
export const danglingRefTool: CanonicalTool = {
  name: 'dangling_ref',
  inputSchema: {
    type: 'object',
    $defs: {
      Money: { type: 'object' },
    },
    properties: {
      total: { $ref: '#/$defs/Currency' },
    },
  },
};

/** A local `$ref` resolving to a string, not a subschema. */
export const nonSchemaRefTool: CanonicalTool = {
  name: 'non_schema_ref',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      alias: { $ref: '#/required/0' },
    },
    required: ['id'],
  },
};

/** A local `$ref` with a malformed percent-escape. */
export const malformedRefTool: CanonicalTool = {
  name: 'malformed_ref',
  inputSchema: {
    type: 'object',
    properties: {
      total: { $ref: '#/$defs/%zz' },
    },
  },
};

/** A `$ref` pointing at a network URI. */
export const externalRefTool: CanonicalTool = {
  name: 'external_ref',
  inputSchema: {
    type: 'object',
    properties: {
      total: { $ref: 'https://example.com/schemas/money.json' },
    },
  },
};

/** A schema declaring a dialect other than 2020-12. */
export const draft07Tool: CanonicalTool = {
  name: 'draft07_dialect',
  inputSchema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { id: { type: 'string' } },
  },
};

/** A schema explicitly declaring 2020-12. No dialect diagnostic. */
export const draft202012Tool: CanonicalTool = {
  name: 'draft202012_dialect',
  inputSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { id: { type: 'string' } },
  },
};

/** A valid `x-mcp-header` usage. No diagnostic. */
export const validHeaderTool: CanonicalTool = {
  name: 'execute_sql',
  description: 'Execute SQL in a region',
  inputSchema: {
    type: 'object',
    properties: {
      region: { type: 'string', 'x-mcp-header': 'Region' },
      query: { type: 'string' },
    },
    required: ['region', 'query'],
  },
};

/** `x-mcp-header` whose value is not an HTTP field-name token. */
export const invalidHeaderTool: CanonicalTool = {
  name: 'bad_header_value',
  inputSchema: {
    type: 'object',
    properties: {
      region: { type: 'string', 'x-mcp-header': 'Region Name' },
    },
  },
};

/** Two properties mirroring into the same header, differing only in case. */
export const duplicateHeaderTool: CanonicalTool = {
  name: 'duplicate_header',
  inputSchema: {
    type: 'object',
    properties: {
      region: { type: 'string', 'x-mcp-header': 'Region' },
      area: { type: 'string', 'x-mcp-header': 'region' },
    },
  },
};

/** `x-mcp-header` on a `number` property, which the spec does not permit. */
export const numberHeaderTool: CanonicalTool = {
  name: 'number_header',
  inputSchema: {
    type: 'object',
    properties: {
      shard: { type: 'number', 'x-mcp-header': 'Shard' },
    },
  },
};

/** OpenAPI-style `nullable`, which JSON Schema 2020-12 ignores. */
export const nullableTool: CanonicalTool = {
  name: 'nullable_property',
  inputSchema: {
    type: 'object',
    properties: {
      note: { type: 'string', nullable: true },
    },
  },
};

/** A minimal, valid MCP `tools/list` result for revision 2026-07-28. */
export const toolsListResult = {
  resultType: 'complete',
  tools: [
    {
      name: 'get_weather',
      title: 'Weather Information Provider',
      description: 'Get current weather information for a location',
      inputSchema: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      },
    },
  ],
  ttlMs: 300_000,
  cacheScope: 'public',
};
