# Compatibility rules

Every rule `mcpProvider.check()` implements, with the specification text it
comes from. Reviewed **2026-08-20** against revision **2026-07-28**.

Diagnostics are sorted by severity, then path, then code, so `check()` output
is deterministic.

Because MCP defers to JSON Schema and places no restriction on which keywords a
tool may use, **most tools produce no diagnostics at all**. All six shared
fixtures in `@schemaport/core` — including `openMapTool` (open string map),
`unionTool` (`anyOf`) and `constraintTool` (`pattern`, `multipleOf`,
`minItems`) — return `[]`. That is the correct answer, not a missing check.

---

## `mcp/tool-name-length`

**warning** · path `name` · compile emits the name unchanged

The tool name is outside 1–128 characters.

> Tool names **SHOULD** be between 1 and 128 characters in length (inclusive).

SHOULD, so a warning rather than an error. `compile()` emits the name unchanged
— renaming a tool changes its identity, and SchemaPort will not do that
silently.

Note `@schemaport/core`'s own `validateCanonicalTool` already rejects names
over 128 characters, so this rule is reached mainly by tools constructed in
memory rather than loaded from a file.

## `mcp/tool-name-characters`

**warning** · path `name` · compile emits the name unchanged

The name contains characters outside `[A-Za-z0-9_.-]`.

> The following **SHOULD** be the only allowed characters: uppercase and
> lowercase ASCII letters (A-Z, a-z), digits (0-9), underscore (\_), hyphen
> (-), and dot (.)

Example: `refund/order:v2` warns; `admin.tools.list`, `DATA_EXPORT_v2` and
`getUser` do not.

Both name rules carry `compile.supported: false`, which describes what compile
can do about the issue — it cannot fix a name without changing the tool's
identity. It does not mean compilation is refused. Refusal requires an `error`
whose `compile.supported` is `false`, and these are warnings, so
`compile()` returns `ok: true` and emits the name as written. The four rules
that genuinely refuse are listed in [compilation.md](compilation.md).

---

## `mcp/input-schema-missing-type`

**error** · path `inputSchema.type` · compile fixes

`inputSchema` declares no `type`. MCP's `Tool.inputSchema` is typed
`{ $schema?: string; type: "object"; [key: string]: unknown }` — the root type
is required.

`compile()` adds `"type": "object"` (transformation
`added-input-schema-type-object`, `lossy: false`). Adding it narrows the
accepted value set rather than widening it, and MCP tool arguments are always a
JSON object, so nothing the canonical schema enforced stops being enforced.
Because compile fixes it, this error is dropped from the compile result and
represented by the transformation record instead.

## `mcp/input-schema-type-not-literal-object`

**error** · path `inputSchema.type` · compile fixes

`inputSchema.type` is `["object"]` — the right type, expressed as a
single-element array. MCP requires the literal string.

`compile()` rewrites it (transformation
`normalized-input-schema-type-to-object`, `lossy: false`). Pure representation
change: the set of accepted values is identical.

## `mcp/input-schema-type-union`

**warning** · path `inputSchema.type` · compile fixes

`inputSchema.type` allows `"object"` **and** other types, e.g.
`["object", "null"]`.

`compile()` narrows to `"object"` (transformation
`narrowed-input-schema-type-to-object`, `lossy: false` — nothing is *weakened*;
the output accepts strictly fewer values). But narrowing changes what the model
may emit at runtime, so under SchemaPort's warning rule this is reported as a
**warning**, and warnings always survive into the compile result. `check()`
would have hidden this if it were filed as a compile-fixable error.

## `mcp/input-schema-not-object`

**error** · path `inputSchema.type` · compile refuses

The root schema does not allow objects at all, e.g. `"type": "string"`.
`compile()` refuses: rewriting the root would change what the tool accepts, and
SchemaPort will not guess.

---

## `mcp/unresolvable-ref`

**warning** · path `<subschema>.$ref` · compile passes it through

A same-document `$ref` (`#/...` or `#anchor`) that does not resolve to a
subschema inside this tool's `inputSchema`.

> Schemas that fail to validate due to an unresolved external `$ref`
> **SHOULD** be rejected rather than silently treated as permissive.

Resolution supported: the root pointer (`#`), JSON Pointer fragments
(`#/$defs/Money`, including `~0`/`~1` escapes and array indices) and `$anchor`
fragments (`#money`). Anything else in the fragment space is reported.

The target must itself be a schema — a JSON object, or the boolean `true` /
`false`. A pointer that lands on a string or on the `properties` map, such as
`#/required/0`, is reported as unresolvable. A pointer with a malformed
percent-escape is reported too, rather than throwing.

`compile()` emits the `$ref` unchanged. SchemaPort never resolves or inlines
references.

## `mcp/external-ref`

**warning** · path `<subschema>.$ref` · compile passes it through

A `$ref` that does not begin with `#` — a network URI, or a relative document
reference.

> Implementations **MUST NOT** automatically dereference `$ref` values that
> resolve to a network URI.

Client support therefore varies: a client with the opt-in fetching mode
disabled (the default) cannot validate against this schema.

---

## `mcp/non-default-schema-dialect`

**warning** · path `inputSchema.$schema` · compile passes it through

`$schema` declares a dialect other than JSON Schema 2020-12.

> Implementations MUST support at least 2020-12 and SHOULD document which
> additional dialects they support.

A draft-07 schema is legal MCP — the spec even shows one as an example — but
whether a given client accepts it is up to that client, which must otherwise
return a dialect-not-supported error. `compile()` emits `$schema` unchanged;
SchemaPort does not translate between dialects.

Only the root `$schema` is inspected.

---

## `mcp/x-mcp-header-invalid`

**error** · path `<subschema>["x-mcp-header"]` · compile refuses

The `x-mcp-header` value is not a string, is empty, or is not an HTTP
field-name token. The token grammar is RFC 9110 §5.6.2:

```
token = 1*tchar
tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*"
      / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
      / DIGIT / ALPHA
```

Control characters, including CR and LF, are excluded by that grammar.

`compile()` refuses. Stripping the annotation would silently remove header
routing the author asked for, and "clients MUST reject" is not something
SchemaPort should paper over.

## `mcp/x-mcp-header-duplicate`

**error** · path `<subschema>["x-mcp-header"]` · compile refuses

Two properties in one `inputSchema` declare `x-mcp-header` values that are
equal case-insensitively. The value MUST be case-insensitively unique within
the `inputSchema`. Reported on the second occurrence, naming the first.

## `mcp/x-mcp-header-unsupported-type`

**error** · path `<subschema>["x-mcp-header"]` · compile refuses

`x-mcp-header` is on a property that does not declare exactly one of `integer`,
`string` or `boolean`.

> **MUST** only be applied to parameters with primitive types (integer, string,
> boolean). Parameters with type `number` are not permitted.

Not checked: the "statically reachable from the schema root" requirement, and
the IEEE-754 safe-integer bound on runtime values. See
[`limitations.md`](limitations.md).

---

## `mcp/nullable-keyword-ignored`

**info** · path `<subschema>.nullable` · compile passes it through

A subschema carries `nullable`, an OpenAPI 3.0 keyword that JSON Schema 2020-12
does not define. MCP validators ignore it, so it constrains nothing. Use
`"type": ["string", "null"]` or `anyOf` instead.

`info` rather than `warning`: `compile()` changes nothing, the keyword is
emitted as written, and `nullable` is documented in `CanonicalTool` as a
provider-specific convenience rather than a portable constraint.

---

## Metadata rules

These fire only when `compileMcpTool(tool, { metadata })` is given metadata.
They validate the supplied MCP fields, not the canonical tool. Full detail in
[`tool-metadata.md`](tool-metadata.md).

| Code | Severity | Fires on |
|---|---|---|
| `mcp/metadata-title-invalid` | error | `title` is not a string |
| `mcp/metadata-output-schema-invalid` | error | `outputSchema` is not an object, or its `$schema` is not a string |
| `mcp/metadata-output-schema-empty` | warning | `outputSchema` is `{}` |
| `mcp/metadata-annotations-invalid` | error | `annotations` is not an object, its `title` is not a string, or a hint is not a boolean |
| `mcp/metadata-annotations-contradictory` | warning | `readOnlyHint: true` together with `destructiveHint: true` |
| `mcp/metadata-icons-invalid` | error | An icon is not an object, or `src` / `mimeType` / `sizes` / `theme` is wrong |
| `mcp/metadata-meta-invalid` | error | `_meta` is not an object |

Every error refuses the compile. A malformed `Tool` is rejected by clients at
`tools/list` time with no useful error, so failing here — where the message can
name `metadata.icons[1].src` — is the more useful outcome.

The two warnings do not refuse. `{}` is a valid schema and contradictory hints
still produce a well-formed `Tool`; in both cases what is wrong is the intent,
not the structure.

## Rules deliberately not implemented

| Not implemented | Why |
|---|---|
| Description length limit | The spec states none |
| Composition-keyword depth / subschema cap | The spec says implementations SHOULD bound these but names **no** number. Picking one would be inventing a rule |
| Restrictions on JSON Schema keywords | The spec explicitly allows any 2020-12 keyword in `inputSchema` |
| Tool-name uniqueness | A whole-server property; not decidable from one tool |
| Meaning-level `outputSchema` rules | The shape of a supplied `outputSchema` is checked (see [`tool-metadata.md`](tool-metadata.md)); whether it *describes* what the tool returns is not decidable from a schema |
| Meta-schema validation of `inputSchema` | Would need a JSON Schema validator; this package has no runtime dependencies |
