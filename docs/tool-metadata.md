# Tool metadata

MCP's `Tool` carries five fields that SchemaPort's canonical format has no
counterpart for:

| Field | What it is |
|---|---|
| `title` | Human-readable display name, distinct from the `name` the model calls |
| `outputSchema` | JSON Schema describing the tool's `structuredContent` result |
| `annotations` | Behaviour hints — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, and a display `title` |
| `icons` | Icons a client may show alongside the tool |
| `_meta` | Protocol-level extension data |

They are supplied to `compileMcpTool()` per call:

```ts
import { compileMcpTool } from '@schemaport/provider-mcp';

compileMcpTool(lookupOrder, {
  metadata: {
    title: 'Look up order',
    outputSchema: {
      type: 'object',
      properties: { status: { type: 'string' }, total: { type: 'number' } },
      required: ['status'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    icons: [{ src: 'https://example.com/order.svg', mimeType: 'image/svg+xml' }],
    _meta: { 'example.com/owner': 'orders-team' },
  },
});
```

```json
{
  "name": "lookup_order",
  "title": "Look up order",
  "description": "Look one order up by id",
  "icons": [{ "src": "https://example.com/order.svg", "mimeType": "image/svg+xml" }],
  "inputSchema": { "type": "object", "properties": { "orderId": { "type": "string" } } },
  "outputSchema": {
    "type": "object",
    "properties": { "status": { "type": "string" }, "total": { "type": "number" } },
    "required": ["status"]
  },
  "annotations": { "readOnlyHint": true, "idempotentHint": true },
  "_meta": { "example.com/owner": "orders-team" }
}
```

## Why an option and not a canonical field

The canonical format describes a tool's **arguments**, and it is the shared
input to four adapters. Three of them — OpenAI, Anthropic, Gemini — have nowhere
to put `annotations` or `icons`, and no notion of a tool-level output schema at
all. Adding five MCP-only fields to every adapter's input to serve one adapter
is the wrong trade.

As a compile option, the canonical tool stays portable across all four targets
and the MCP output still carries everything MCP can express.

The cost is real and worth naming: **a tool file cannot record its own
metadata.** If you load canonical tools from disk, you have to keep the metadata
somewhere alongside them and pair the two up yourself. The `schemaport` CLI does
not do that pairing, so `schemaport compile --targets mcp` emits the three-field
form.

## `outputSchema`

The consequential one. It is how a server declares that it returns
`structuredContent`; without it a compiled tool can only ever return
unstructured text.

Unlike `inputSchema` it need **not** be an object schema — a tool may return an
array or a scalar:

```ts
compileMcpTool(tool, { metadata: { outputSchema: { type: 'array', items: { type: 'string' } } } });
compileMcpTool(tool, { metadata: { outputSchema: { type: 'string' } } });
```

SchemaPort shape-checks it (is it an object? is `$schema` a string?) but does
not validate it against a JSON Schema meta-schema — the same position it takes
on `inputSchema`, and for the same reason: that would need a validator, and this
package has no runtime dependencies.

An **empty** `outputSchema` is warned about:

```
⚠ `outputSchema` is an empty schema, so it constrains nothing, but clients
  will still expect `structuredContent` on every result. Omit it, or describe
  the result.
  Path: metadata.outputSchema
```

`{}` is a valid JSON Schema meaning "any value", so this is not an error — but
declaring it commits the server to returning structured content it has not
described, which is rarely what anyone means.

## `annotations`

All four hints are advisory. The specification is explicit that clients **MUST**
treat annotations from untrusted servers as untrusted; they are a UI affordance,
not a security control.

One combination is warned about:

```
⚠ `readOnlyHint: true` and `destructiveHint: true` contradict each other.
  `destructiveHint` is only meaningful when the tool is not read-only; a
  client reading both cannot tell which to believe.
  Path: metadata.annotations.destructiveHint
```

`readOnlyHint` says the tool does not modify its environment. `destructiveHint`
describes *how* it modifies it, so MCP defines it as meaningful only when the
tool is not read-only. The `Tool` is still well-formed, so this is a warning
rather than a refusal.

## What refuses the compile

Everything else is structural, and a structural problem is an **error** that
refuses the compile:

| Code | Fires on |
|---|---|
| `mcp/metadata-title-invalid` | `title` is not a string |
| `mcp/metadata-output-schema-invalid` | `outputSchema` is not an object, or its `$schema` is not a string |
| `mcp/metadata-annotations-invalid` | `annotations` is not an object, its `title` is not a string, or a hint is not a boolean |
| `mcp/metadata-icons-invalid` | `icons` is not an array, an entry is not an object, `src` is missing or empty, `mimeType` is not a string, `sizes` is not an array of strings, or `theme` is neither `light` nor `dark` |
| `mcp/metadata-meta-invalid` | `_meta` is not an object |

The refusal is deliberate. A malformed `Tool` is rejected by clients at
`tools/list` time with no useful error, so it is better to fail here, where the
message can name the exact field:

```
✗ `src` is required on every icon and must be a non-empty string.
  Path: metadata.icons[1].src
```

## Determinism

Two guarantees, both tested:

- **Field order follows MCP's `Tool` declaration**, not the order you wrote the
  option literal in. Two compiles of the same input serialize to identical
  bytes however the option was written.
- **Metadata is deep-cloned on the way out.** Mutating your option object after
  compiling cannot change output that has already been written to disk.

## Transformations

One, non-lossy:

```
attached-tool-metadata
  Attached MCP tool metadata not present in the canonical tool: `title`, `outputSchema`.
```

Attaching metadata adds fields and removes nothing, so it destroys no constraint
and needs no `allowLossy`. The listed fields are in declaration order, not the
order you wrote them.

## Sources

- [MCP 2026-07-28 — Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP 2026-07-28 — Output schema](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#output-schema)
- [`schema.ts` for 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
