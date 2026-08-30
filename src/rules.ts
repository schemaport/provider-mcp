/**
 * Shared constants for the MCP adapter.
 *
 * Everything here is derived from the Model Context Protocol specification
 * revision {@link MCP_SPEC_REVISION}. See `docs/` for the source URLs and the
 * exact wording each rule is built on.
 */

import type { ProviderDocReference } from '@schemaport/core';

/** Adapter id used on the SchemaPort command line. */
export const PROVIDER_ID = 'mcp';

/** Human-readable adapter name. */
export const DISPLAY_NAME = 'MCP';

/**
 * The MCP protocol revision these rules implement.
 *
 * This is the *specification* date, not the date the rules were reviewed.
 * See {@link RULES_REVIEWED_AT} for the latter.
 */
export const MCP_SPEC_REVISION = '2026-07-28';

/** ISO date the rules were last checked against the official specification. */
export const RULES_REVIEWED_AT = '2026-08-20';

const SPEC_BASE = `https://modelcontextprotocol.io/specification/${MCP_SPEC_REVISION}`;

/** Official documentation pages backing every rule in this package. */
export const DOC_URLS = {
  tools: `${SPEC_BASE}/server/tools`,
  toolNames: `${SPEC_BASE}/server/tools#tool-names`,
  xMcpHeader: `${SPEC_BASE}/server/tools#x-mcp-header`,
  outputSchema: `${SPEC_BASE}/server/tools#output-schema`,
  toolAnnotations: `${SPEC_BASE}/server/tools#tool-annotations`,
  jsonSchemaUsage: `${SPEC_BASE}/basic#json-schema-usage`,
  refResolution: `${SPEC_BASE}/basic#ref-resolution`,
  schemaReference: `${SPEC_BASE}/schema`,
  schemaSource: `https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/${MCP_SPEC_REVISION}/schema.ts`,
  versioning: 'https://modelcontextprotocol.io/specification/versioning',
} as const;

/** The `docs` array published on the provider object. */
export const MCP_DOCS: readonly ProviderDocReference[] = Object.freeze([
  { title: `MCP specification ${MCP_SPEC_REVISION} — Tools`, url: DOC_URLS.tools },
  { title: `MCP specification ${MCP_SPEC_REVISION} — Tool names`, url: DOC_URLS.toolNames },
  { title: `MCP specification ${MCP_SPEC_REVISION} — x-mcp-header`, url: DOC_URLS.xMcpHeader },
  {
    title: `MCP specification ${MCP_SPEC_REVISION} — JSON Schema usage`,
    url: DOC_URLS.jsonSchemaUsage,
  },
  { title: `MCP specification ${MCP_SPEC_REVISION} — $ref resolution`, url: DOC_URLS.refResolution },
  { title: `MCP specification ${MCP_SPEC_REVISION} — Schema reference`, url: DOC_URLS.schemaReference },
  { title: `MCP schema.ts (source of truth) — ${MCP_SPEC_REVISION}`, url: DOC_URLS.schemaSource },
  { title: 'MCP specification versioning', url: DOC_URLS.versioning },
]);

/**
 * Tool names SHOULD be between 1 and 128 characters (inclusive).
 *
 * > Tool names **SHOULD** be between 1 and 128 characters in length (inclusive).
 * — MCP 2026-07-28, Tools § Tool Names
 */
export const TOOL_NAME_MIN_LENGTH = 1;
export const TOOL_NAME_MAX_LENGTH = 128;

/**
 * Characters the specification lists as the only ones that SHOULD be used in a
 * tool name: ASCII letters, digits, underscore, hyphen and dot.
 */
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * RFC 9110 §5.6.2 `token = 1*tchar`. HTTP field names are tokens (RFC 9110
 * §5.1), and `x-mcp-header` values MUST match field-name token syntax.
 */
export const HTTP_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Types a property carrying `x-mcp-header` may declare. `number` is excluded by the spec. */
export const X_MCP_HEADER_TYPES: readonly string[] = Object.freeze(['integer', 'string', 'boolean']);

/** The `x-mcp-header` extension keyword. */
export const X_MCP_HEADER_KEYWORD = 'x-mcp-header';

/**
 * `$schema` values that identify JSON Schema 2020-12 — the dialect MCP
 * defaults to and that every implementation MUST support.
 */
export const JSON_SCHEMA_2020_12_IDS: readonly string[] = Object.freeze([
  'https://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2020-12/schema#',
  'http://json-schema.org/draft/2020-12/schema',
  'http://json-schema.org/draft/2020-12/schema#',
]);

/** Diagnostic codes emitted by this adapter. */
export const CODES = {
  toolNameLength: 'mcp/tool-name-length',
  toolNameCharacters: 'mcp/tool-name-characters',
  inputSchemaMissingType: 'mcp/input-schema-missing-type',
  inputSchemaTypeNotLiteralObject: 'mcp/input-schema-type-not-literal-object',
  inputSchemaTypeUnion: 'mcp/input-schema-type-union',
  inputSchemaNotObject: 'mcp/input-schema-not-object',
  unresolvableRef: 'mcp/unresolvable-ref',
  externalRef: 'mcp/external-ref',
  nonDefaultSchemaDialect: 'mcp/non-default-schema-dialect',
  xMcpHeaderInvalid: 'mcp/x-mcp-header-invalid',
  xMcpHeaderDuplicate: 'mcp/x-mcp-header-duplicate',
  xMcpHeaderUnsupportedType: 'mcp/x-mcp-header-unsupported-type',
  nullableKeywordIgnored: 'mcp/nullable-keyword-ignored',
  metadataTitleInvalid: 'mcp/metadata-title-invalid',
  metadataOutputSchemaInvalid: 'mcp/metadata-output-schema-invalid',
  metadataOutputSchemaEmpty: 'mcp/metadata-output-schema-empty',
  metadataAnnotationsInvalid: 'mcp/metadata-annotations-invalid',
  metadataAnnotationsContradictory: 'mcp/metadata-annotations-contradictory',
  metadataIconsInvalid: 'mcp/metadata-icons-invalid',
  metadataMetaInvalid: 'mcp/metadata-meta-invalid',
} as const;

/** Transformation codes emitted by `compile()`. */
export const TRANSFORMATIONS = {
  addedInputSchemaType: 'added-input-schema-type-object',
  normalizedInputSchemaType: 'normalized-input-schema-type-to-object',
  narrowedInputSchemaType: 'narrowed-input-schema-type-to-object',
  attachedToolMetadata: 'attached-tool-metadata',
} as const;
