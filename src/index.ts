import type {
  CanonicalTool,
  CompileOptions,
  CompileResult,
  Diagnostic,
  SchemaPortProvider,
} from "@schemaport/core";
import { finalizeCompile } from "@schemaport/core";

const ID = "mcp";

/**
 * PLACEHOLDER. Replaced by the MCP implementation.
 */
export const mcpProvider: SchemaPortProvider = {
  id: ID,
  displayName: "MCP",
  rulesReviewedAt: "2026-08-20",
  docs: [],
  check(_tool: CanonicalTool): Diagnostic[] {
    return [];
  },
  compile(tool: CanonicalTool, options?: CompileOptions): CompileResult {
    return finalizeCompile({
      providerId: ID,
      tool,
      output: { name: tool.name, description: tool.description, inputSchema: tool.inputSchema },
      transformations: [],
      diagnostics: [],
      options,
    });
  },
};

export default mcpProvider;
