# Examples

Every output below was produced by this package. Implemented against MCP
specification revision `2026-07-28`.

## 1. A tool that needs nothing

```ts
import { mcpProvider, validateMcpTool } from '@schemaport/provider-mcp';

const refundOrder = {
  name: 'refund_order',
  description: 'Refunds all or part of an order',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order to refund' },
      amount: {
        type: 'number',
        minimum: 0,
        description: 'Amount to refund. Omit to refund the full order.',
      },
    },
    required: ['orderId'],
  },
};

mcpProvider.check(refundOrder);
// []

const result = mcpProvider.compile(refundOrder);
// result.ok             -> true
// result.transformations -> []
// result.diagnostics     -> []

validateMcpTool(result.output);
// { valid: true, errors: [] }
```

`result.output`:

```json
{
  "name": "refund_order",
  "description": "Refunds all or part of an order",
  "inputSchema": {
    "type": "object",
    "properties": {
      "orderId": { "type": "string", "description": "The order to refund" },
      "amount": {
        "type": "number",
        "minimum": 0,
        "description": "Amount to refund. Omit to refund the full order."
      }
    },
    "required": ["orderId"]
  }
}
```

Identical to the input. `minimum: 0` survives, `amount` stays optional, the
object stays open.

## 2. Serving it from `tools/list`

```ts
import { mcpProvider, validateToolsListResult } from '@schemaport/provider-mcp';

const tools = [refundOrder, createTicket]
  .map((tool) => mcpProvider.compile(tool))
  .filter((result) => result.ok)
  .map((result) => result.output);

const listResult = {
  resultType: 'complete',
  tools,
  ttlMs: 300_000,
  cacheScope: 'public',
};

validateToolsListResult(listResult);
// { valid: true, errors: [] }
```

Wrap it in the JSON-RPC envelope yourself:

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "resultType": "complete", "tools": [], "ttlMs": 300000, "cacheScope": "public" } }
```

`validateToolsListResult` takes the `result` object, not the envelope.

## 3. A root schema missing its `type`

```ts
mcpProvider.compile({
  name: 'no_root_type',
  inputSchema: { properties: { id: { type: 'string' } } },
});
```

```json
{
  "providerId": "mcp",
  "toolName": "no_root_type",
  "ok": true,
  "output": {
    "name": "no_root_type",
    "inputSchema": { "type": "object", "properties": { "id": { "type": "string" } } }
  },
  "transformations": [
    {
      "code": "added-input-schema-type-object",
      "path": "inputSchema.type",
      "detail": "Added `\"type\": \"object\"` at the root of `inputSchema`, which MCP requires.",
      "lossy": false
    }
  ],
  "diagnostics": []
}
```

The `mcp/input-schema-missing-type` error is gone from the result because
compile fixed it; the transformation is the report.

## 4. A union root type — narrowed, and warned about

```ts
mcpProvider.compile({
  name: 'union_root_type',
  inputSchema: { type: ['object', 'null'], properties: { id: { type: 'string' } } },
});
```

```json
{
  "ok": true,
  "output": {
    "name": "union_root_type",
    "inputSchema": { "type": "object", "properties": { "id": { "type": "string" } } }
  },
  "transformations": [
    {
      "code": "narrowed-input-schema-type-to-object",
      "path": "inputSchema.type",
      "detail": "Narrowed the root type to `\"object\"`, dropping `null`. MCP tool arguments are always a JSON object.",
      "lossy": false
    }
  ],
  "diagnostics": [
    {
      "providerId": "mcp",
      "toolName": "union_root_type",
      "severity": "warning",
      "code": "mcp/input-schema-type-union",
      "message": "`inputSchema.type` also allows `null`. MCP requires the literal string `\"object\"` at the root, so the compiled tool accepts objects only.",
      "path": "inputSchema.type",
      "compile": {
        "supported": true,
        "lossy": false,
        "detail": "Emits `\"type\": \"object\"`, dropping the other root types from the union."
      },
      "docsUrl": "https://modelcontextprotocol.io/specification/2026-07-28/server/tools"
    }
  ]
}
```

Not lossy — the output accepts strictly fewer values — but it changes runtime
behaviour, so the warning survives the compile.

## 5. A root schema that cannot hold arguments

```ts
mcpProvider.compile({ name: 'string_root', inputSchema: { type: 'string' } });
```

```json
{
  "providerId": "mcp",
  "toolName": "string_root",
  "ok": false,
  "transformations": [],
  "diagnostics": [
    {
      "severity": "error",
      "code": "mcp/input-schema-not-object",
      "message": "`inputSchema` does not allow objects at the root. MCP tool arguments are always a JSON object, so `inputSchema` must declare `\"type\": \"object\"`.",
      "path": "inputSchema.type",
      "compile": {
        "supported": false,
        "lossy": false,
        "detail": "Refused: rewriting a non-object root schema would change what the tool accepts."
      },
      "docsUrl": "https://modelcontextprotocol.io/specification/2026-07-28/server/tools"
    }
  ]
}
```

No `output`. `allowLossy` does not help — this is not a lossy transformation,
it is a rewrite SchemaPort refuses to guess at.

## 6. A tool name outside MCP's guidance

```ts
mcpProvider.check({ name: 'refund/order:v2', inputSchema: { type: 'object', properties: {} } });
```

```json
[
  {
    "providerId": "mcp",
    "toolName": "refund/order:v2",
    "severity": "warning",
    "code": "mcp/tool-name-characters",
    "message": "Tool name `refund/order:v2` uses characters outside the set MCP recommends. Tool names SHOULD contain only ASCII letters, digits, underscore (_), hyphen (-) and dot (.).",
    "path": "name",
    "compile": {
      "supported": false,
      "lossy": false,
      "detail": "The tool name is emitted unchanged; renaming a tool changes its identity."
    },
    "docsUrl": "https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names"
  }
]
```

A warning, because the naming rules are SHOULD-level. The tool still compiles,
name untouched.

## 7. `$ref`

```ts
// Resolves inside the tool's own $defs — nothing reported.
mcpProvider.check({
  name: 'local_ref',
  inputSchema: {
    type: 'object',
    $defs: { Money: { type: 'object', properties: { amount: { type: 'number' } } } },
    properties: { total: { $ref: '#/$defs/Money' } },
    required: ['total'],
  },
});
// []
```

```ts
// Points at a definition that does not exist.
mcpProvider.check({
  name: 'dangling_ref',
  inputSchema: {
    type: 'object',
    $defs: { Money: { type: 'object' } },
    properties: { total: { $ref: '#/$defs/Currency' } },
  },
});
```

```json
[
  {
    "severity": "warning",
    "code": "mcp/unresolvable-ref",
    "message": "`$ref` (#/$defs/Currency) does not resolve to a subschema inside this tool's `inputSchema`. A schema that fails to validate because of an unresolved `$ref` SHOULD be rejected rather than treated as permissive.",
    "path": "inputSchema.properties.total.$ref",
    "compile": {
      "supported": false,
      "lossy": false,
      "detail": "`$ref` is emitted unchanged; SchemaPort does not resolve references."
    },
    "docsUrl": "https://modelcontextprotocol.io/specification/2026-07-28/basic#ref-resolution"
  }
]
```

A `$ref` to `https://example.com/schemas/money.json` produces
`mcp/external-ref` instead — MCP clients MUST NOT dereference network URIs
automatically.

The tool still compiles in both cases; the reference is emitted as written.

## 8. `x-mcp-header`

```ts
// Valid: a string parameter mirrored into `Mcp-Param-Region`.
mcpProvider.check({
  name: 'execute_sql',
  inputSchema: {
    type: 'object',
    properties: {
      region: { type: 'string', 'x-mcp-header': 'Region' },
      query: { type: 'string' },
    },
    required: ['region', 'query'],
  },
});
// []
```

```ts
// Invalid: `number` is explicitly not permitted.
mcpProvider.check({
  name: 'number_header',
  inputSchema: {
    type: 'object',
    properties: { shard: { type: 'number', 'x-mcp-header': 'Shard' } },
  },
});
// -> [{ code: 'mcp/x-mcp-header-unsupported-type', severity: 'error', … }]

mcpProvider.compile(numberHeaderTool).ok; // false
```

Also errors: a value that is not an HTTP field-name token
(`mcp/x-mcp-header-invalid`), and two properties mapping to the same header
case-insensitively (`mcp/x-mcp-header-duplicate`).

## 9. Catching a stale `tools/list` shape

A result written for revision `2025-06-18`:

```ts
validateToolsListResult({ tools: [{ name: 'x', inputSchema: { type: 'object' } }] });
```

```json
{
  "valid": false,
  "errors": [
    "result.resultType: is required and must be \"complete\".",
    "result.ttlMs: is required and must be a number of milliseconds >= 0.",
    "result.cacheScope: is required and must be \"public\" or \"private\"."
  ]
}
```

All three fields are new in `2026-07-28`.

## 10. Probing

```ts
await mcpProvider.probe(refundOrder);
```

```ts
{
  providerId: 'mcp',
  toolName: 'refund_order',
  status: 'skipped',
  schemaAccepted: false,
  toolCallReturned: false,
  notes: [
    'MCP has no hosted API to probe: it is a protocol that servers implement, and there is ' +
    'no endpoint or API key to send a tool definition to. SchemaPort validates MCP tool ' +
    'definitions locally instead — use validateMcpTool() and validateToolsListResult(), or ' +
    '`schemaport check --targets mcp`.',
  ],
}
```

Always. No environment variable is read and no request is made.
