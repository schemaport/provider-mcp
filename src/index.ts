/**
 * `@schemaport/provider-mcp`
 *
 * SchemaPort adapter for the Model Context Protocol.
 *
 * MCP has no hosted API and no API key: it is a protocol servers implement.
 * This package therefore validates and generates MCP-compatible tool
 * definitions locally. It is **not** an MCP client or server, it opens no
 * transport, and it makes no network requests.
 *
 * Implemented against MCP specification revision 2026-07-28.
 */

import type {
  CanonicalTool,
  CompileOptions,
  CompileResult,
  Diagnostic,
  ProbeOptions,
  ProbeResult,
  SchemaPortProvider,
} from '@schemaport/core';
import { probeSkipped } from '@schemaport/core';

import { checkMcpTool } from './check.js';
import { compileMcpTool } from './compile.js';
import { DISPLAY_NAME, MCP_DOCS, PROVIDER_ID, RULES_REVIEWED_AT } from './rules.js';

/**
 * The MCP provider adapter.
 *
 * `apiKeyEnvVar` is deliberately unset — there is no MCP API to authenticate
 * against. `probe()` always returns `status: 'skipped'`; use
 * {@link validateMcpTool} and {@link validateToolsListResult} to verify the
 * compiled definition offline instead.
 *
 * `compile()` here takes the shared `CompileOptions`. To attach MCP-only
 * fields such as `outputSchema` or `annotations`, call {@link compileMcpTool}
 * directly with `McpCompileOptions` — the shared provider interface has no
 * slot for provider-specific options.
 */
export const mcpProvider: SchemaPortProvider = {
  id: PROVIDER_ID,
  displayName: DISPLAY_NAME,
  rulesReviewedAt: RULES_REVIEWED_AT,
  docs: MCP_DOCS,

  check(tool: CanonicalTool): Diagnostic[] {
    return checkMcpTool(tool);
  },

  compile(tool: CanonicalTool, options?: CompileOptions): CompileResult {
    return compileMcpTool(tool, options);
  },

  async probe(tool: CanonicalTool, _options?: ProbeOptions): Promise<ProbeResult> {
    return probeSkipped(
      { providerId: PROVIDER_ID, toolName: tool.name },
      'MCP has no hosted API to probe: it is a protocol that servers implement, and there is no ' +
        'endpoint or API key to send a tool definition to. SchemaPort validates MCP tool ' +
        'definitions locally instead — use validateMcpTool() and validateToolsListResult(), or ' +
        '`schemaport check --targets mcp`.',
    );
  },
};

export default mcpProvider;

export { checkMcpTool, classifyRootType } from './check.js';
export type { RootTypeVerdict } from './check.js';
export { compileMcpTool } from './compile.js';
export type { McpCompileOptions } from './compile.js';
export { checkMcpMetadata, METADATA_FIELDS, presentMetadataFields } from './metadata.js';
export type { McpMetadataField, McpToolMetadata } from './metadata.js';
export { validateMcpTool, validateToolsListResult } from './validate.js';

export {
  CODES as MCP_DIAGNOSTIC_CODES,
  DOC_URLS as MCP_DOC_URLS,
  MCP_DOCS,
  MCP_SPEC_REVISION,
  RULES_REVIEWED_AT,
  TRANSFORMATIONS as MCP_TRANSFORMATION_CODES,
} from './rules.js';

export type {
  McpIcon,
  McpTool,
  McpToolAnnotations,
  McpToolsListResult,
  McpValidationResult,
} from './types.js';
