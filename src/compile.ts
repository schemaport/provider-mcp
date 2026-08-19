/**
 * Compile a canonical tool into an MCP `Tool` object.
 *
 * MCP defers to JSON Schema, so this is close to an identity transform: the
 * canonical `inputSchema` is emitted verbatim. The only repair compile()
 * performs is forcing the root `type` to the literal string `"object"`, which
 * MCP requires. Every such change is recorded as a `Transformation`.
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
import { PROVIDER_ID, TRANSFORMATIONS } from './rules.js';
import type { McpTool } from './types.js';

/** Compile a canonical tool for MCP. */
export function compileMcpTool(tool: CanonicalTool, options?: CompileOptions): CompileResult {
  const diagnostics = checkMcpTool(tool);
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

  const output = { name: tool.name } as McpTool;
  if (tool.description !== undefined) output.description = tool.description;
  output.inputSchema = inputSchema as McpTool['inputSchema'];

  return finalizeCompile({
    providerId: PROVIDER_ID,
    tool,
    output,
    transformations,
    diagnostics,
    options,
  });
}
