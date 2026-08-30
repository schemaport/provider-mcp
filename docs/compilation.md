# Compilation

`mcpProvider.compile(tool, options?)` turns a `CanonicalTool` into an MCP
`Tool` object you can put straight into a `tools/list` result.

## Output shape

```ts
{
  name: string;            // always, copied verbatim
  description?: string;    // only when the canonical tool has one
  inputSchema: {           // the canonical inputSchema, with `type: "object"` guaranteed
    type: 'object';
    [keyword: string]: unknown;
  };
}
```

Key order is fixed, following MCP's own `Tool` declaration — `name`, `title`,
`description`, `icons`, `inputSchema`, `outputSchema`, `annotations`, `_meta` —
with absent fields skipped, so repeated compilation serializes byte-identically.

`title`, `outputSchema`, `annotations`, `icons` and `_meta` have no counterpart
in `CanonicalTool`, so they are supplied per call:

```ts
compileMcpTool(tool, { metadata: { title: 'Refund an order' } });
```

They are validated before emission and refused if malformed. See
[tool-metadata.md](tool-metadata.md). Without a `metadata` option the output is
exactly the three-field form shown above.

## Example

Compiling `refundOrderTool` from `@schemaport/core`:

```ts
import { refundOrderTool } from '@schemaport/core';
import { mcpProvider } from '@schemaport/provider-mcp';

mcpProvider.compile(refundOrderTool);
```

```json
{
  "providerId": "mcp",
  "toolName": "refund_order",
  "ok": true,
  "output": {
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
  },
  "transformations": [],
  "diagnostics": []
}
```

Nothing changed. `minimum: 0` survives, the optional `amount` stays optional,
and the object stays open. That is the whole point of MCP as a target: it
speaks JSON Schema, so the canonical schema is already the answer.

## Transformations

Four, all `lossy: false`. Three touch only the root `type`; the fourth records
metadata that was attached.

| Code | When | Detail |
|---|---|---|
| `added-input-schema-type-object` | Root schema has no `type` | Adds `"type": "object"` |
| `normalized-input-schema-type-to-object` | Root `type` is `["object"]` | Rewrites it as the literal string |
| `narrowed-input-schema-type-to-object` | Root `type` is a union containing `"object"` | Narrows to `"object"`, dropping the others |
| `attached-tool-metadata` | A `metadata` option was given | Names the fields added, in declaration order |

### Why none of them is lossy

Under SchemaPort's lossy rule, `lossy: true` means the compiled
schema **accepts inputs the canonical schema rejects** — a constraint was
dropped or weakened. All three transformations do the opposite: they make the
root type at least as strict as it was. No `minimum`, `pattern`, `enum`,
`additionalProperties` or composition keyword is ever dropped, rewritten or
truncated by this adapter.

`attached-tool-metadata` is not lossy for a simpler reason: it only adds
fields. Nothing in the canonical schema is removed or weakened by declaring an
`outputSchema` or a `title`.

So `compile()` never needs `allowLossy` for MCP. Passing it changes nothing.

### Narrowing still warns

`narrowed-input-schema-type-to-object` is not lossy, but it does change what
the model may emit at runtime — `["object", "null"]` stops accepting `null`.
SchemaPort's warning rule requires that to be visible, so `check()` emits
`mcp/input-schema-type-union` as a **warning**, and warnings survive into the
compile result:

```json
{
  "ok": true,
  "transformations": [
    {
      "code": "narrowed-input-schema-type-to-object",
      "path": "inputSchema.type",
      "detail": "Narrowed the root type to `\"object\"`, dropping `null`. MCP tool arguments are always a JSON object.",
      "lossy": false
    }
  ],
  "diagnostics": [
    { "code": "mcp/input-schema-type-union", "severity": "warning", "…": "…" }
  ]
}
```

The other two root-type repairs are filed as compile-fixable **errors**, so
`finalizeCompile` drops them from the result — the transformation record is the
report.

## When compilation is refused

`ok: false` and no `output`, whenever `check()` produced an error `compile()`
cannot work around:

- `mcp/input-schema-not-object`
- `mcp/x-mcp-header-invalid`
- `mcp/x-mcp-header-duplicate`
- `mcp/x-mcp-header-unsupported-type`

The blocking diagnostics stay in `result.diagnostics` so the caller can see
why. `allowLossy` does not override any of these — they are not lossy
transformations, they are things SchemaPort refuses to guess at.

## Determinism

Compiling the same canonical tool twice produces byte-identical output and the
same `transformations` array in the same order. There is no clock, no random
source, and no iteration over an unordered set. `check()` output is sorted
before it is returned. Object key order is inherited from the canonical schema,
except where a repair rebuilds the root — which places `type` first, always.

## Determinism and `tools/list`

MCP servers SHOULD return tools from `tools/list` in a deterministic order, so
clients can cache the list and LLM prompt caches hit more often. Since
SchemaPort's output is stable, sorting your tools once (by `name`, say) is
enough to satisfy that.
