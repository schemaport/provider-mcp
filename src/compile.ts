/**
 * Compile a canonical tool into an MCP `Tool` object.
 *
 * MCP defers to JSON Schema, so this is close to an identity transform: the
 * canonical `inputSchema` is emitted verbatim. The only repair compile()
 * performs is forcing the root `type` to the literal string `"object"`, which
 * MCP requires. Every such change is recorded as a `Transformation`.
 *
 * Callers may also attach MCP-only fields — `title`, `outputSchema`,
 * `annotations`, `icons` and `_meta` — through {@link McpCompileOptions}.
 * These have no canonical counterpart, so they are supplied per call rather
 * than read off the tool. See `metadata.ts` for why.
 */

import type {
  CanonicalTool,
  CompileOptions,
  CompileResult,
  JsonSchema,
  Transformation,
} from '@schemaport/core';
import {
  asSchema,
  cloneSchema,
  finalizeCompile,
  joinPath,
  schemaTypes,
  transformation,
} from '@schemaport/core';

import { checkMcpTool, classifyRootType } from './check.js';
import { checkMcpMetadata, presentMetadataFields } from './metadata.js';
import type { McpToolMetadata } from './metadata.js';
import { PROVIDER_ID, TRANSFORMATIONS } from './rules.js';
import type { McpTool } from './types.js';

/** Options accepted by {@link compileMcpTool}. */
export interface McpCompileOptions extends CompileOptions {
  /**
   * MCP `Tool` fields with no canonical counterpart.
   *
   * Validated before emission; a structural problem refuses the compile
   * rather than producing a `Tool` clients will reject.
   */
  metadata?: McpToolMetadata;
}

/** Compile a canonical tool for MCP. */
export function compileMcpTool(tool: CanonicalTool, options?: McpCompileOptions): CompileResult {
  const metadata = options?.metadata;
  const diagnostics = [...checkMcpTool(tool), ...checkMcpMetadata(tool, metadata)];
  const transformations: Transformation[] = [];

  const source: JsonSchema = asSchema(tool.inputSchema) ?? {};
  let inputSchema = cloneSchema(source);
  const typePath = joinPath('inputSchema', 'type');

  switch (classifyRootType(source)) {
    case 'missing': {
      // Rebuilt rather than assigned so `type` always lands in the same
      // position, which keeps the serialized output byte-stable.
      inputSchema = { type: 'object', ...inputSchema };
      transformations.push(
        transformation(
          TRANSFORMATIONS.addedInputSchemaType,
          typePath,
          'Added `"type": "object"` at the root of `inputSchema`, which MCP requires.',
          false,
        ),
      );
      break;
    }
    case 'array-object-only': {
      inputSchema.type = 'object';
      transformations.push(
        transformation(
          TRANSFORMATIONS.normalizedInputSchemaType,
          typePath,
          'Rewrote `"type": ["object"]` as the literal string `"object"`, which MCP requires.',
          false,
        ),
      );
      break;
    }
    case 'union-with-object': {
      const dropped = schemaTypes(source).filter((type) => type !== 'object');
      inputSchema.type = 'object';
      transformations.push(
        transformation(
          TRANSFORMATIONS.narrowedInputSchemaType,
          typePath,
          `Narrowed the root type to \`"object"\`, dropping ${dropped
            .map((type) => `\`${type}\``)
            .join(', ')}. MCP tool arguments are always a JSON object.`,
          false,
        ),
      );
      break;
    }
    case 'literal-object':
    case 'not-object':
      // `literal-object` needs nothing. `not-object` is an unrecoverable error
      // raised by check(); finalizeCompile refuses the compile.
      break;
  }

  // Field order follows MCP's own `Tool` declaration so that two compiles of
  // the same input serialize to identical bytes.
  const output = { name: tool.name } as McpTool;
  // Metadata is cloned on the way out: the caller's option object must not be
  // reachable from the compiled result, or a later mutation of it would
  // silently change output that has already been written to disk.
  if (metadata?.title !== undefined) output.title = metadata.title;
  if (tool.description !== undefined) output.description = tool.description;
  if (metadata?.icons !== undefined) output.icons = cloneSchema(metadata.icons);
  output.inputSchema = inputSchema as McpTool['inputSchema'];
  if (metadata?.outputSchema !== undefined) {
    output.outputSchema = cloneSchema(metadata.outputSchema) as McpTool['outputSchema'];
  }
  if (metadata?.annotations !== undefined) output.annotations = cloneSchema(metadata.annotations);
  if (metadata?._meta !== undefined) output._meta = cloneSchema(metadata._meta);

  const attached = presentMetadataFields(metadata);
  if (attached.length > 0) {
    transformations.push(
      transformation(
        TRANSFORMATIONS.attachedToolMetadata,
        'metadata',
        `Attached MCP tool metadata not present in the canonical tool: ${attached
          .map((field) => `\`${field}\``)
          .join(', ')}.`,
        false,
      ),
    );
  }

  return finalizeCompile({
    providerId: PROVIDER_ID,
    tool,
    output,
    transformations,
    diagnostics,
    options,
  });
}
