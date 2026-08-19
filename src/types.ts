/**
 * MCP protocol shapes, transcribed from the official `schema.ts` for
 * specification revision 2026-07-28.
 *
 * These describe the wire format SchemaPort emits and validates. They are not
 * an MCP client or server; nothing here talks to a transport.
 *
 * @see https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts
 */

/** `Icon` — an optionally-sized icon a client may display. */
export interface McpIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: 'light' | 'dark';
  [key: string]: unknown;
}

/**
 * `ToolAnnotations` — behaviour hints. Every field is a hint only; clients
 * MUST treat annotations from untrusted servers as untrusted.
 */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
}

/**
 * `Tool` — a tool definition as returned from `tools/list`.
 *
 * `name` and `inputSchema` are required; everything else is optional. The type
 * is intentionally open: `Tool` carries `_meta` and permits extension keys.
 */
export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  icons?: McpIcon[];
  inputSchema: { $schema?: string; type: 'object'; [keyword: string]: unknown };
  outputSchema?: { $schema?: string; [keyword: string]: unknown };
  annotations?: McpToolAnnotations;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * `ListToolsResult` — the bare `result` object of a `tools/list` response.
 *
 * In revision 2026-07-28 `ListToolsResult` extends both `PaginatedResult` and
 * `CacheableResult`, so `resultType`, `ttlMs` and `cacheScope` are all
 * required alongside `tools`.
 */
export interface McpToolsListResult {
  resultType: string;
  tools: McpTool[];
  nextCursor?: string;
  ttlMs: number;
  cacheScope: 'public' | 'private';
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The result of a local protocol-shape validation. */
export interface McpValidationResult {
  /** `true` when no errors were found. */
  valid: boolean;
  /** One line per problem, each prefixed with the path it was found at. Empty when valid. */
  errors: string[];
}
