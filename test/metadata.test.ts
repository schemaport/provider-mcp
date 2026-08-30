import { describe, expect, it } from 'vitest';
import type { CanonicalTool } from '@schemaport/core';

import { compileMcpTool } from '../src/compile.js';
import { METADATA_FIELDS, checkMcpMetadata, presentMetadataFields } from '../src/metadata.js';
import type { McpToolMetadata } from '../src/metadata.js';
import { CODES } from '../src/rules.js';
import type { McpTool } from '../src/types.js';
import { validateMcpTool } from '../src/validate.js';

const tool: CanonicalTool = {
  name: 'lookup_order',
  description: 'Look one order up by id',
  inputSchema: {
    type: 'object',
    properties: { orderId: { type: 'string' } },
    required: ['orderId'],
  },
};

const compile = (metadata?: McpToolMetadata) => compileMcpTool(tool, { metadata });
const output = (metadata?: McpToolMetadata) => compile(metadata).output as McpTool;
const codes = (metadata: McpToolMetadata) => checkMcpMetadata(tool, metadata).map((d) => d.code);

describe('compileMcpTool with metadata', () => {
  it('emits nothing extra when no metadata is supplied', () => {
    const result = compileMcpTool(tool);

    expect(Object.keys(result.output as McpTool)).toEqual(['name', 'description', 'inputSchema']);
    expect(result.transformations).toEqual([]);
  });

  it('treats an absent `metadata` option the same as an absent options object', () => {
    expect(compileMcpTool(tool)).toEqual(compileMcpTool(tool, {}));
  });

  it('emits every metadata field', () => {
    const metadata: McpToolMetadata = {
      title: 'Look up order',
      outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
      annotations: { readOnlyHint: true, openWorldHint: false },
      icons: [{ src: 'https://example.com/i.svg', mimeType: 'image/svg+xml' }],
      _meta: { 'example.com/owner': 'orders-team' },
    };

    expect(output(metadata)).toEqual({
      name: 'lookup_order',
      title: 'Look up order',
      description: 'Look one order up by id',
      icons: [{ src: 'https://example.com/i.svg', mimeType: 'image/svg+xml' }],
      inputSchema: tool.inputSchema,
      outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { 'example.com/owner': 'orders-team' },
    });
  });

  it('produces a Tool that passes protocol validation', () => {
    const result = validateMcpTool(
      output({
        title: 'Look up order',
        outputSchema: { type: 'array', items: { type: 'string' } },
        annotations: { title: 'Lookup', idempotentHint: true },
        icons: [{ src: 'https://example.com/i.png', sizes: ['48x48'], theme: 'dark' }],
        _meta: { note: 'ok' },
      }),
    );

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('accepts a non-object outputSchema, which MCP explicitly allows', () => {
    expect(output({ outputSchema: { type: 'string' } }).outputSchema).toEqual({ type: 'string' });
  });

  it('records one non-lossy transformation naming the attached fields', () => {
    const { transformations } = compile({ title: 'T', _meta: { a: 1 } });

    expect(transformations).toHaveLength(1);
    expect(transformations[0]?.code).toBe('attached-tool-metadata');
    expect(transformations[0]?.lossy).toBe(false);
    expect(transformations[0]?.detail).toContain('`title`, `_meta`');
  });

  it('names attached fields in MCP declaration order, not the order they were written', () => {
    const written = compile({ _meta: { a: 1 }, annotations: {}, title: 'T' });

    expect(written.transformations[0]?.detail).toContain('`title`, `annotations`, `_meta`');
  });

  it('serializes byte-identically however the option literal was ordered', () => {
    const a = output({ title: 'T', outputSchema: { type: 'string' }, _meta: { a: 1 } });
    const b = output({ _meta: { a: 1 }, title: 'T', outputSchema: { type: 'string' } });

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not let a later mutation of the caller\'s object change compiled output', () => {
    const metadata: McpToolMetadata = { outputSchema: { type: 'object', properties: {} } };
    const compiled = output(metadata);

    (metadata.outputSchema as Record<string, unknown>)['type'] = 'string';

    expect((compiled.outputSchema as Record<string, unknown>)['type']).toBe('object');
  });

  it('leaves inputSchema handling untouched', () => {
    const withMeta = output({ title: 'T' });

    expect(withMeta.inputSchema).toEqual(tool.inputSchema);
  });
});

describe('checkMcpMetadata', () => {
  it('returns nothing for absent metadata', () => {
    expect(checkMcpMetadata(tool, undefined)).toEqual([]);
  });

  it('returns nothing for valid metadata', () => {
    expect(codes({ title: 'T', annotations: { readOnlyHint: true } })).toEqual([]);
  });

  it.each([
    ['a non-string title', { title: 7 }, CODES.metadataTitleInvalid],
    ['a non-object outputSchema', { outputSchema: 'nope' }, CODES.metadataOutputSchemaInvalid],
    ['a non-string outputSchema.$schema', { outputSchema: { $schema: 1 } }, CODES.metadataOutputSchemaInvalid],
    ['non-object annotations', { annotations: [] }, CODES.metadataAnnotationsInvalid],
    ['a non-boolean hint', { annotations: { readOnlyHint: 'yes' } }, CODES.metadataAnnotationsInvalid],
    ['non-array icons', { icons: {} }, CODES.metadataIconsInvalid],
    ['an icon with no src', { icons: [{ mimeType: 'image/png' }] }, CODES.metadataIconsInvalid],
    ['an icon with an empty src', { icons: [{ src: '' }] }, CODES.metadataIconsInvalid],
    ['an unknown icon theme', { icons: [{ src: 'a', theme: 'sepia' }] }, CODES.metadataIconsInvalid],
    ['non-object _meta', { _meta: 'nope' }, CODES.metadataMetaInvalid],
  ])('rejects %s', (_label, metadata, code) => {
    const diagnostics = checkMcpMetadata(tool, metadata as McpToolMetadata);

    expect(diagnostics.map((d) => d.code)).toContain(code);
    expect(diagnostics.every((d) => d.severity === 'error')).toBe(true);
    expect(diagnostics.every((d) => d.compile.supported === false)).toBe(true);
  });

  it('refuses the compile when metadata is structurally invalid', () => {
    const result = compile({ icons: [{ src: '' }] } as McpToolMetadata);

    expect(result.ok).toBe(false);
    expect(result.output).toBeUndefined();
  });

  it('names the exact field, so the message is actionable', () => {
    const [issue] = checkMcpMetadata(tool, { icons: [{ src: 'a' }, { src: '' }] } as McpToolMetadata);

    expect(issue?.path).toBe('metadata.icons[1].src');
  });

  it('warns about an empty outputSchema without refusing it', () => {
    const result = compile({ outputSchema: {} });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain(CODES.metadataOutputSchemaEmpty);
    expect((result.output as McpTool).outputSchema).toEqual({});
  });

  it('warns when readOnlyHint and destructiveHint contradict each other', () => {
    const result = compile({ annotations: { readOnlyHint: true, destructiveHint: true } });

    expect(result.ok).toBe(true);
    const contradiction = result.diagnostics.find(
      (d) => d.code === CODES.metadataAnnotationsContradictory,
    );
    expect(contradiction?.severity).toBe('warning');
    expect(contradiction?.path).toBe('metadata.annotations.destructiveHint');
  });

  it('does not warn when destructiveHint is set on a tool that is not read-only', () => {
    expect(codes({ annotations: { readOnlyHint: false, destructiveHint: true } })).toEqual([]);
    expect(codes({ annotations: { destructiveHint: true } })).toEqual([]);
  });

  it('is deterministic', () => {
    const metadata = { title: 7, icons: [{ src: '' }] } as unknown as McpToolMetadata;

    expect(checkMcpMetadata(tool, metadata)).toEqual(checkMcpMetadata(tool, metadata));
  });
});

describe('presentMetadataFields', () => {
  it('returns nothing for absent or empty metadata', () => {
    expect(presentMetadataFields(undefined)).toEqual([]);
    expect(presentMetadataFields({})).toEqual([]);
  });

  it('ignores fields explicitly set to undefined', () => {
    expect(presentMetadataFields({ title: undefined, _meta: { a: 1 } })).toEqual(['_meta']);
  });

  it('always reports in METADATA_FIELDS order', () => {
    expect(presentMetadataFields({ _meta: {}, icons: [], title: 'T' })).toEqual([
      'title',
      'icons',
      '_meta',
    ]);
    expect(METADATA_FIELDS).toEqual(['title', 'outputSchema', 'annotations', 'icons', '_meta']);
  });
});
