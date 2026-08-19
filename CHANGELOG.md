# Changelog

All notable changes to `@schemaport/provider-mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-20

Initial release. Implemented against Model Context Protocol specification
revision **2026-07-28**; rules reviewed on **2026-08-20**.

### Added

- `mcpProvider` (named and default export), a `SchemaPortProvider` with
  `id: 'mcp'` and `displayName: 'MCP'`.
- `check()` with thirteen compatibility rules, every one traceable to spec
  text: `mcp/tool-name-length`, `mcp/tool-name-characters`,
  `mcp/input-schema-missing-type`, `mcp/input-schema-type-not-literal-object`,
  `mcp/input-schema-type-union`, `mcp/input-schema-not-object`,
  `mcp/unresolvable-ref`, `mcp/external-ref`,
  `mcp/non-default-schema-dialect`, `mcp/x-mcp-header-invalid`,
  `mcp/x-mcp-header-duplicate`, `mcp/x-mcp-header-unsupported-type`,
  `mcp/nullable-keyword-ignored`.
- `compile()` producing an MCP `Tool` object ready to return from
  `tools/list`. Three transformations, all `lossy: false`:
  `added-input-schema-type-object`,
  `normalized-input-schema-type-to-object`,
  `narrowed-input-schema-type-to-object`.
- `probe()` returning `status: 'skipped'`. MCP has no hosted API, no endpoint
  and no API key, so `apiKeyEnvVar` is deliberately unset.
- `validateMcpTool()` and `validateToolsListResult()`, local protocol-shape
  validation standing in for probing. `validateToolsListResult` enforces the
  2026-07-28 additions `resultType`, `ttlMs` and `cacheScope`.
- Exported types `McpTool`, `McpToolAnnotations`, `McpIcon`,
  `McpToolsListResult`, `McpValidationResult`, `RootTypeVerdict`.
- Exported constants `MCP_DIAGNOSTIC_CODES`, `MCP_TRANSFORMATION_CODES`,
  `MCP_DOC_URLS`, `MCP_DOCS`, `MCP_SPEC_REVISION`, `RULES_REVIEWED_AT`.
- Test suite covering every rule by diagnostic code, valid/invalid/warning
  fixtures, deterministic compilation, compile-then-validate round trips, and
  negative cases for both validation helpers. No test makes a network request.
- Documentation in `docs/`: MCP support, compatibility rules, compilation,
  validation, limitations and examples.

[Unreleased]: https://github.com/schemaport/provider-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/schemaport/provider-mcp/releases/tag/v0.1.0
