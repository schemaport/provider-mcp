/**
 * Optional MCP tool metadata supplied at compile time.
 *
 * MCP's `Tool` carries five fields that have no counterpart in SchemaPort's
 * canonical format: `title`, `outputSchema`, `annotations`, `icons` and
 * `_meta`. The canonical format describes a tool's *arguments*, and it is
 * shared by four providers — three of which have nowhere to put any of this.
 * Adding the fields there would push MCP-only concepts into every adapter's
 * input.
 *
 * So they are supplied to `compileMcpTool()` instead, as a per-call option.
 * The canonical tool stays portable; the MCP output gets everything MCP can
 * express.
 *
 * Metadata is validated before it is emitted. A malformed `Tool` is rejected
 * by clients at `tools/list` time with no useful error, so compile() refuses
 * it here, where the message can name the exact field.
 */

import type { CanonicalTool, Diagnostic, JsonSchema } from '@schemaport/core';
import { diagnostic, isPlainObject, notCompilable } from '@schemaport/core';

import { CODES, DOC_URLS, PROVIDER_ID } from './rules.js';
import type { McpIcon, McpToolAnnotations } from './types.js';

/** MCP `Tool` fields that are not expressible in the canonical format. */
export interface McpToolMetadata {
  /**
   * Human-readable display name. Distinct from `name`, which is the
   * programmatic identifier the model calls.
   */
  title?: string;
  /**
   * JSON Schema describing the tool's `structuredContent` result.
   *
   * Unlike `inputSchema` this need **not** be an object schema — a tool may
   * return an array, a string, a number, a boolean or null.
   */
  outputSchema?: JsonSchema;
  /** Behaviour hints. Advisory only; clients must not trust them for security. */
  annotations?: McpToolAnnotations;
  /** Icons a client may display alongside the tool. */
  icons?: McpIcon[];
  /** Protocol-level extension data. Reserved by MCP for implementations. */
  _meta?: Record<string, unknown>;
}

/** Fields emitted from {@link McpToolMetadata}, in the order MCP declares them. */
export const METADATA_FIELDS = ['title', 'outputSchema', 'annotations', 'icons', '_meta'] as const;

export type McpMetadataField = (typeof METADATA_FIELDS)[number];

const ICON_THEMES = ['light', 'dark'];
const BOOLEAN_HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const;

const REFUSAL = 'Emitting this would produce a `Tool` that MCP clients reject.';

/**
 * Validate supplied metadata.
 *
 * Structural problems are errors carrying `notCompilable()`, so
 * `finalizeCompile()` refuses the compile rather than emitting a `Tool` no
 * client will accept. Two conditions are warnings instead, because the `Tool`
 * they produce is well-formed but says something the author probably did not
 * mean.
 *
 * Returns an empty array when there is no metadata, or nothing wrong with it.
 */
export function checkMcpMetadata(
  tool: CanonicalTool,
  metadata: McpToolMetadata | undefined,
): Diagnostic[] {
  if (metadata === undefined) return [];

  const diagnostics: Diagnostic[] = [];
  const emit = (init: Omit<Parameters<typeof diagnostic>[0], 'providerId' | 'toolName'>): void => {
    diagnostics.push(diagnostic({ providerId: PROVIDER_ID, toolName: tool.name, ...init }));
  };
  const reject = (code: string, path: string, message: string): void => {
    emit({ code, severity: 'error', path, message, compile: notCompilable(REFUSAL), docsUrl: DOC_URLS.tools });
  };

  if (metadata.title !== undefined && typeof metadata.title !== 'string') {
    reject(CODES.metadataTitleInvalid, 'metadata.title', '`title` must be a string.');
  }

  checkOutputSchema(metadata.outputSchema, emit, reject);
  checkAnnotations(metadata.annotations, emit, reject);
  checkIcons(metadata.icons, reject);

  if (metadata._meta !== undefined && !isPlainObject(metadata._meta)) {
    reject(CODES.metadataMetaInvalid, 'metadata._meta', '`_meta` must be a JSON object.');
  }

  return diagnostics;
}

type Emit = (init: Omit<Parameters<typeof diagnostic>[0], 'providerId' | 'toolName'>) => void;
type Reject = (code: string, path: string, message: string) => void;

function checkOutputSchema(value: unknown, emit: Emit, reject: Reject): void {
  if (value === undefined) return;

  if (!isPlainObject(value)) {
    reject(
      CODES.metadataOutputSchemaInvalid,
      'metadata.outputSchema',
      '`outputSchema` must be a JSON Schema object.',
    );
    return;
  }

  if (value['$schema'] !== undefined && typeof value['$schema'] !== 'string') {
    reject(
      CODES.metadataOutputSchemaInvalid,
      'metadata.outputSchema.$schema',
      '`outputSchema.$schema` must be a string when present.',
    );
  }

  // Not an error: MCP explicitly allows a non-object output schema, because a
  // tool may return an array or a scalar as its structured content. But an
  // empty schema constrains nothing, while still obliging the server to return
  // `structuredContent` on every result — almost always a mistake rather than
  // a deliberate "any value" declaration.
  if (Object.keys(value).length === 0) {
    emit({
      code: CODES.metadataOutputSchemaEmpty,
      severity: 'warning',
      path: 'metadata.outputSchema',
      message:
        '`outputSchema` is an empty schema, so it constrains nothing, but clients will still ' +
        'expect `structuredContent` on every result. Omit it, or describe the result.',
      compile: notCompilable(
        'Emitted as given. The empty schema is valid; only the intent behind it is doubtful.',
      ),
      docsUrl: DOC_URLS.outputSchema,
    });
  }
}

function checkAnnotations(value: unknown, emit: Emit, reject: Reject): void {
  if (value === undefined) return;

  if (!isPlainObject(value)) {
    reject(CODES.metadataAnnotationsInvalid, 'metadata.annotations', '`annotations` must be a JSON object.');
    return;
  }

  if (value['title'] !== undefined && typeof value['title'] !== 'string') {
    reject(
      CODES.metadataAnnotationsInvalid,
      'metadata.annotations.title',
      '`annotations.title` must be a string when present.',
    );
  }

  for (const hint of BOOLEAN_HINTS) {
    if (value[hint] !== undefined && typeof value[hint] !== 'boolean') {
      reject(
        CODES.metadataAnnotationsInvalid,
        `metadata.annotations.${hint}`,
        `\`annotations.${hint}\` must be a boolean when present.`,
      );
    }
  }

  // `readOnlyHint: true` says the tool does not modify its environment;
  // `destructiveHint` describes *how* it modifies it, so MCP defines it as
  // meaningful only when the tool is not read-only. A client reading both set
  // to true cannot tell which to believe. The `Tool` is still well-formed, so
  // this is a warning, not a refusal.
  if (value['readOnlyHint'] === true && value['destructiveHint'] === true) {
    emit({
      code: CODES.metadataAnnotationsContradictory,
      severity: 'warning',
      path: 'metadata.annotations.destructiveHint',
      message:
        '`readOnlyHint: true` and `destructiveHint: true` contradict each other. ' +
        '`destructiveHint` is only meaningful when the tool is not read-only; a client reading ' +
        'both cannot tell which to believe.',
      compile: notCompilable('Both hints are emitted unchanged. Resolving the contradiction is the author\'s call.'),
      docsUrl: DOC_URLS.tools,
    });
  }
}

function checkIcons(value: unknown, reject: Reject): void {
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    reject(CODES.metadataIconsInvalid, 'metadata.icons', '`icons` must be an array.');
    return;
  }

  value.forEach((icon, index) => {
    const path = `metadata.icons[${index}]`;
    if (!isPlainObject(icon)) {
      reject(CODES.metadataIconsInvalid, path, 'Each icon must be a JSON object.');
      return;
    }
    if (typeof icon['src'] !== 'string' || icon['src'].length === 0) {
      reject(
        CODES.metadataIconsInvalid,
        `${path}.src`,
        '`src` is required on every icon and must be a non-empty string.',
      );
    }
    if (icon['mimeType'] !== undefined && typeof icon['mimeType'] !== 'string') {
      reject(CODES.metadataIconsInvalid, `${path}.mimeType`, '`mimeType` must be a string when present.');
    }
    if (
      icon['sizes'] !== undefined &&
      (!Array.isArray(icon['sizes']) || icon['sizes'].some((size) => typeof size !== 'string'))
    ) {
      reject(CODES.metadataIconsInvalid, `${path}.sizes`, '`sizes` must be an array of strings when present.');
    }
    if (
      icon['theme'] !== undefined &&
      (typeof icon['theme'] !== 'string' || !ICON_THEMES.includes(icon['theme']))
    ) {
      reject(CODES.metadataIconsInvalid, `${path}.theme`, '`theme` must be "light" or "dark" when present.');
    }
  });
}

/**
 * The metadata fields actually present, in {@link METADATA_FIELDS} order.
 *
 * Order is fixed here rather than taken from the caller's object so compiled
 * output is byte-identical however the option literal was written.
 */
export function presentMetadataFields(metadata: McpToolMetadata | undefined): McpMetadataField[] {
  if (metadata === undefined) return [];
  return METADATA_FIELDS.filter((field) => metadata[field] !== undefined);
}
