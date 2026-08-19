# @schemaport/provider-mcp

SchemaPort adapter for the **Model Context Protocol**.

Define a tool schema once in SchemaPort's canonical format, then check it
against MCP's requirements and compile it into a `Tool` object you can return
straight from `tools/list`.

- **Spec revision implemented:** `2026-07-28`
- **`rulesReviewedAt`:** `2026-08-20`

> This package is **not** an MCP client or server. It has no runtime
> dependencies beyond `@schemaport/core`, opens no transport, and makes no
> network requests. It validates and generates MCP tool definitions locally.

## Install

```sh
npm install @schemaport/provider-mcp
```

## Use

```ts
import { mcpProvider, validateMcpTool } from '@schemaport/provider-mcp';

const tool = {
  name: 'refund_order',
  description: 'Refunds all or part of an order',
  inputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'The order to refund' },
      amount: { type: 'number', minimum: 0 },
    },
    required: ['orderId'],
  },
};

mcpProvider.check(tool);
// => []

const result = mcpProvider.compile(tool);
// result.ok            -> true
// result.transformations -> []
// result.output        -> a ready-to-return MCP Tool

validateMcpTool(result.output);
// => { valid: true, errors: [] }
```

## What this adapter does

MCP defers almost entirely to JSON Schema. `inputSchema` may carry **any**
JSON Schema 2020-12 keyword alongside `type` — composition (`oneOf`, `anyOf`,
`allOf`, `not`), conditionals (`if`/`then`/`else`), references (`$ref`,
`$defs`, `$anchor`), and every validation and annotation keyword. The
specification places no restriction on which of them you may use.

So the honest result is that **most canonical tools compile to MCP unchanged,
with zero transformations and zero diagnostics**. That is not a gap in the
rules; it is what the specification says. No rule in this package was invented
to make the output look thorough — every one cites the spec text it comes from.

### Compatibility rules

| Code | Severity | compile() |
|---|---|---|
| `mcp/tool-name-length` | warning | refuses |
| `mcp/tool-name-characters` | warning | refuses |
| `mcp/input-schema-missing-type` | error | fixes (adds `"type": "object"`) |
| `mcp/input-schema-type-not-literal-object` | error | fixes (`["object"]` → `"object"`) |
| `mcp/input-schema-type-union` | warning | fixes (narrows to `"object"`) |
| `mcp/input-schema-not-object` | error | refuses |
| `mcp/unresolvable-ref` | warning | passes through |
| `mcp/external-ref` | warning | passes through |
| `mcp/non-default-schema-dialect` | warning | passes through |
| `mcp/x-mcp-header-invalid` | error | refuses |
| `mcp/x-mcp-header-duplicate` | error | refuses |
| `mcp/x-mcp-header-unsupported-type` | error | refuses |
| `mcp/nullable-keyword-ignored` | info | passes through |

Full descriptions and the spec wording behind each rule:
[`docs/compatibility-rules.md`](docs/compatibility-rules.md).

### Transformations

Three, all `lossy: false`, all touching only the root `type`:
`added-input-schema-type-object`, `normalized-input-schema-type-to-object`,
`narrowed-input-schema-type-to-object`. **No MCP transformation is lossy** —
see [`docs/compilation.md`](docs/compilation.md).

### Local validation instead of probing

MCP has no hosted API, no endpoint and no API key, so there is nothing to
probe. `mcpProvider.probe()` is implemented and always returns
`status: 'skipped'` with an explanation, and `apiKeyEnvVar` is unset.

In its place, two helpers validate protocol shape offline:

```ts
import { validateMcpTool, validateToolsListResult } from '@schemaport/provider-mcp';

validateMcpTool(value);          // -> { valid: boolean; errors: string[] }
validateToolsListResult(value);  // -> { valid: boolean; errors: string[] }
```

`validateToolsListResult` takes the bare `result` object of a `tools/list`
response, not the JSON-RPC envelope. What they check and what they do not:
[`docs/validation.md`](docs/validation.md).

## Known limitations

- No MCP client and no MCP server. Nothing here speaks a transport.
- No live probing against a running MCP server.
- `$ref` is never resolved or inlined. Unresolvable and non-local refs are
  reported as warnings and the schema is emitted as written.
- Schemas are not validated against a JSON Schema meta-schema.
- MCP's `outputSchema`, `title`, `annotations`, `icons` and `_meta` are never
  emitted: `CanonicalTool` has no field to carry them.

The full list, with reasons: [`docs/limitations.md`](docs/limitations.md).

## Documentation

- [`docs/mcp-support.md`](docs/mcp-support.md) — what MCP requires of a tool
  definition, and the revision implemented against
- [`docs/compatibility-rules.md`](docs/compatibility-rules.md) — every rule
- [`docs/compilation.md`](docs/compilation.md) — output shape and
  transformations
- [`docs/validation.md`](docs/validation.md) — the two validation helpers
- [`docs/limitations.md`](docs/limitations.md) — known limitations
- [`docs/examples.md`](docs/examples.md) — worked examples

## Official sources

Rules reviewed against these on **2026-08-20**, spec revision **2026-07-28**:

- [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [Tool names](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names)
- [`x-mcp-header`](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header)
- [JSON Schema usage](https://modelcontextprotocol.io/specification/2026-07-28/basic#json-schema-usage)
- [`$ref` resolution](https://modelcontextprotocol.io/specification/2026-07-28/basic#ref-resolution)
- [Schema reference](https://modelcontextprotocol.io/specification/2026-07-28/schema)
- [`schema.ts` (source of truth)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
- [Versioning](https://modelcontextprotocol.io/specification/versioning)

## Licence

MIT
