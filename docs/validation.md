# Validation

MCP has no hosted API, no endpoint and no API key, so there is nothing to
probe. `mcpProvider.probe()` **is** implemented, and always returns:

```ts
{
  providerId: 'mcp',
  toolName: '<tool>',
  status: 'skipped',
  schemaAccepted: false,
  toolCallReturned: false,
  notes: ['MCP has no hosted API to probe: …'],
}
```

It reads no environment variable, constructs no client, and ignores every
`ProbeOptions` field. `apiKeyEnvVar` is deliberately unset on the provider.

The method is implemented rather than omitted so that a caller iterating
providers gets an explicit, explained `skipped` verdict instead of having to
special-case a missing method.

In its place, two helpers validate protocol shape entirely offline.

## `validateMcpTool(value, path?)`

```ts
function validateMcpTool(value: unknown, path?: string): {
  valid: boolean;
  errors: string[];
};
```

Validates one MCP `Tool` object. `path` (default `'tool'`) prefixes every
error message.

### What it checks

All MUST-level structure from revision 2026-07-28:

- the value is a JSON object;
- `name` is present and a non-empty string;
- `title` and `description` are strings when present;
- `inputSchema` is present, is a JSON object, and declares the literal
  `"type": "object"`;
- `inputSchema.$schema` is a string when present;
- `outputSchema` is a JSON object when present, with a string `$schema` when
  present — it need **not** be an object schema, since `outputSchema` may be
  any JSON Schema 2020-12;
- `annotations` is a JSON object when present, with a string `title` and
  boolean `readOnlyHint` / `destructiveHint` / `idempotentHint` /
  `openWorldHint` when those are present;
- `icons` is an array when present, each entry a JSON object with a non-empty
  string `src`, a string `mimeType`, a string array `sizes`, and a `theme` of
  `"light"` or `"dark"` when those are present;
- `_meta` is a JSON object when present.

Every problem is reported, not just the first.

### What it does **not** check

- **Unknown keys are accepted.** `Tool` is an open object — it carries `_meta`
  and permits extension keys — so rejecting unknown properties would be
  stricter than the protocol and would produce false failures.
- **SHOULD-level tool-name guidance.** A name with a space or a slash passes
  the validator. Naming guidance is a compatibility rule, not a shape rule —
  use `mcpProvider.check()` for it.
- **JSON Schema validity.** `inputSchema` and `outputSchema` are not validated
  against a meta-schema. `{ "type": "object", "minimum": "nonsense" }` passes.
- **`$ref` resolution.** No reference is followed. Use `check()` for
  `mcp/unresolvable-ref` and `mcp/external-ref`.
- **`x-mcp-header` constraints.** They are transport-conditional (Streamable
  HTTP only). Use `check()`.
- **Dialect support.** A `$schema` naming any dialect passes. Use `check()` for
  `mcp/non-default-schema-dialect`.
- **Icon URI safety.** The spec's icon security rules — HTTPS or `data:` only,
  no `javascript:`/`file:`, same-origin preference — are client-side runtime
  concerns and are not enforced here.

## `validateToolsListResult(value, path?)`

```ts
function validateToolsListResult(value: unknown, path?: string): {
  valid: boolean;
  errors: string[];
};
```

Validates the **bare `result` object** of a `tools/list` response — a
`ListToolsResult`. Pass `response.result`, not `response`. Passing the JSON-RPC
envelope fails, by design.

### What it checks

- the value is a JSON object;
- `resultType` is present and equal to `"complete"`;
- `tools` is present, is an array, and every entry passes `validateMcpTool`
  (errors carry an indexed path, e.g. `result.tools[2].inputSchema`);
- `ttlMs` is present and is a finite number `>= 0`;
- `cacheScope` is present and is `"public"` or `"private"`;
- `nextCursor` is a string when present;
- `_meta` is a JSON object when present.

`resultType`, `ttlMs` and `cacheScope` are all **required** in revision
2026-07-28 — `ListToolsResult extends PaginatedResult, CacheableResult` — and
none of them existed in `2025-06-18`. A result written for that older revision
fails here:

```ts
validateToolsListResult({ tools: [validTool] });
// {
//   valid: false,
//   errors: [
//     'result.resultType: is required and must be "complete".',
//     'result.ttlMs: is required and must be a number of milliseconds >= 0.',
//     'result.cacheScope: is required and must be "public" or "private".',
//   ],
// }
```

### What it does **not** check

- **The JSON-RPC envelope.** `jsonrpc`, `id`, error framing — none of it.
- **Tool-name uniqueness across the array.** Uniqueness within a server is a
  SHOULD; this validator stays MUST-only.
- **Pagination consistency.** Whether `nextCursor` corresponds to more results
  is a server concern.
- **Unknown keys**, for the same reason as `validateMcpTool`.
- **`ttlMs` being an integer.** The spec types it `number` with
  `@minimum 0`.

## Round trip

Compilation output always validates:

```ts
const result = mcpProvider.compile(tool);
if (result.ok) {
  validateMcpTool(result.output); // { valid: true, errors: [] }
}
```

This is asserted in the test suite for every shared fixture and every
root-type-repair fixture.

## No network, ever

Neither helper, nor `check()`, `compile()` or `probe()`, makes a network
request. The test suite makes none either. This package has no runtime
dependency other than `@schemaport/core`.
