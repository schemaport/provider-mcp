# Known limitations

Reviewed **2026-08-20** against MCP specification revision **2026-07-28**.

## No MCP client or server

This package does not implement MCP. It has no transport, no JSON-RPC layer, no
session handling and no runtime dependency on `@modelcontextprotocol/sdk` or
anything else beyond `@schemaport/core`. It validates and generates tool
definitions; wiring them into a server is your job.

## No live probing

`mcpProvider.probe()` always returns `status: 'skipped'`. There is no MCP API
to send a tool definition to — MCP is a protocol, not a hosted service, so
there is no endpoint, no model, and no API key. `apiKeyEnvVar` is unset.

SchemaPort cannot tell you whether *your* MCP client will accept a definition;
it can only tell you whether the definition matches the specification.
[`validation.md`](validation.md) covers the offline stand-in.

## `$ref` is never resolved

SchemaPort does not resolve or inline `$ref`. The reference is emitted exactly
as written.

- A same-document `$ref` that does not resolve inside the tool's own
  `inputSchema` produces `mcp/unresolvable-ref` (warning).
- A `$ref` that is not same-document produces `mcp/external-ref` (warning).

Resolution *detection* supports the root pointer (`#`), JSON Pointer fragments
(`#/$defs/Money`, with `~0`/`~1` escapes and array indices) and `$anchor`
fragments (`#money`), and requires the target to be a schema — an object or a
boolean. It does not implement `$id` base-URI resolution, so a schema that
relocates its base with `$id` may be reported as unresolvable when a full JSON
Schema implementation would resolve it.

`$anchor` detection re-walks the whole schema per anchor reference. Tool
schemas are small and this runs once per `check()`, so it is not a hot path,
but it is quadratic in schemas that use many anchors.

## Subschema traversal is not exhaustive

Rules that walk subschemas — `$ref`, `x-mcp-header` and `nullable` — use
`walkSchema` from `@schemaport/core`, which recurses into `properties`,
`$defs`, `definitions`, `items`, `prefixItems`, `anyOf`, `oneOf`, `allOf`,
`not` and object-valued `additionalProperties`.

It does **not** recurse into `if` / `then` / `else`, `patternProperties`,
`propertyNames`, `contains`, `dependentSchemas`, `unevaluatedProperties` or
`unevaluatedItems`. A `$ref`, `x-mcp-header` or `nullable` hiding under one of
those keywords is not reported. This is a `@schemaport/core` traversal limit,
not an MCP one.

## `x-mcp-header`: two constraints not checked

- **Static reachability.** The spec requires `x-mcp-header` only on properties
  *statically reachable from the schema root*, defined in the Streamable HTTP
  transport specification. That definition is not implemented here, so an
  annotation on an unreachable property is not flagged.
- **Integer safe range.** Integer values must fall within IEEE-754
  double-precision safe-integer range (−2⁵³+1 to 2⁵³−1). That is a property of
  runtime argument *values*, not of the schema, so it cannot be checked
  statically.

## No meta-schema validation

`inputSchema` is not validated against the JSON Schema 2020-12 meta-schema. A
schema with a malformed keyword — `{"type": "object", "minimum": "ten"}` —
passes `check()` and `validateMcpTool`. Implementing this would need a JSON
Schema validator, which would mean a runtime dependency.

`@schemaport/core`'s `validateCanonicalTool` does perform a structural check of
the canonical format before a provider ever sees the tool, which catches many
such mistakes earlier.

## No composition-depth or subschema-count bound

The spec says implementations SHOULD bound composition-keyword cost to prevent
denial-of-service, but names **no** numeric limit. No rule is implemented,
because any threshold would be invented rather than specified. If your client
enforces a bound, check against it yourself.

## No description-length rule

The specification states no description length limit for MCP tools. None is
enforced.

## Fields the canonical tool cannot carry

`CanonicalTool` is `{ name, description?, inputSchema }`. It has no field for
MCP's `title`, `outputSchema`, `annotations`, `icons` or `_meta`, and it is not
going to gain one: the canonical format describes a tool's *arguments* and is
shared by four adapters, three of which have nowhere to put any of this.

They are supplied to `compileMcpTool()` per call instead, which keeps the
canonical tool portable while letting the MCP output carry everything MCP can
express:

```ts
compileMcpTool(tool, {
  metadata: { outputSchema: { type: 'object', properties: { status: { type: 'string' } } } },
});
```

See [tool-metadata.md](tool-metadata.md).

The remaining limitation is that **metadata is per call, not per tool file**.
A canonical `.json` tool definition cannot record its own `outputSchema`, so a
pipeline that loads tools from disk has to keep the metadata alongside them and
pair the two up itself. The `schemaport` CLI does not do that pairing: its
`compile` command calls `compile(tool, { allowLossy })` and nothing else, so
`schemaport compile --targets mcp` still emits the four-field form. Exposing
metadata on the command line is a change to the CLI package, not this one.

## Tool-name uniqueness is not checked

Names must be unique within a server (a SHOULD). Neither `check()` (which sees
one tool) nor `validateToolsListResult` (which stays MUST-only) enforces it.

## Only the root `$schema` is inspected

`mcp/non-default-schema-dialect` looks at `inputSchema.$schema`. A `$schema`
declared on a nested subschema is not reported.

## Revision-specific by design

`validateToolsListResult` requires `resultType`, `ttlMs` and `cacheScope`,
which are new in `2026-07-28`. It will reject a `tools/list` result shaped for
`2025-06-18` or `2025-11-25`. This is intentional — that is what "implemented
against revision 2026-07-28" means — but if you serve an earlier revision for
backwards compatibility, do not use this helper on those responses.
