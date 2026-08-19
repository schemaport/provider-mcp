# MCP support

- **Specification revision implemented against:** `2026-07-28`
- **`rulesReviewedAt`:** `2026-08-20`

These are two different dates on purpose. `2026-07-28` is the MCP protocol
revision; `2026-08-20` is the day the rules in this package were last checked
against the official documentation.

MCP versions its protocol as `YYYY-MM-DD`, incremented only on a backwards
incompatible change. `2026-07-28` was the current revision at review time
([versioning](https://modelcontextprotocol.io/specification/versioning)).

## The `Tool` shape

Transcribed from the official
[`schema.ts`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
(`Tool extends BaseMetadata, Icons`):

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | **yes** | `string` | Unique identifier for the tool |
| `title` | no | `string` | Human-readable display name |
| `description` | no | `string` | A hint to the model |
| `icons` | no | `Icon[]` | For display in user interfaces |
| `inputSchema` | **yes** | `{ $schema?: string; type: "object"; [k: string]: unknown }` | Literal `"object"` at the root |
| `outputSchema` | no | `{ $schema?: string; [k: string]: unknown }` | Any JSON Schema 2020-12 — need not be an object schema |
| `annotations` | no | `ToolAnnotations` | Behaviour hints only |
| `_meta` | no | object | Protocol metadata |

`ToolAnnotations` is `{ title?, readOnlyHint?, destructiveHint?,
idempotentHint?, openWorldHint? }`, all optional, all hints. Clients MUST treat
annotations as untrusted unless the server is trusted.

`Icon` is `{ src, mimeType?, sizes?, theme? }`; only `src` is required.

## `inputSchema`

`inputSchema` MUST be a valid JSON Schema object (not `null`) and MUST declare
`type: "object"` at the root, because tool arguments are always a JSON object.
Beyond that the spec is explicit that anything goes:

> Beyond that, any JSON Schema 2020-12 keyword may appear alongside `type` —
> including composition keywords (`oneOf`, `anyOf`, `allOf`, `not`),
> conditional keywords (`if`/`then`/`else`), reference keywords (`$ref`,
> `$defs`, `$anchor`), and any other standard validation or annotation
> keywords.
> — `schema.ts`, `Tool.inputSchema`

For a tool with no parameters, the spec recommends
`{ "type": "object", "additionalProperties": false }`, and also permits
`{ "type": "object" }`.

## JSON Schema dialect

- A schema with no `$schema` field defaults to **JSON Schema 2020-12**.
- A schema MAY declare a different dialect via `$schema`.
- Implementations MUST support at least 2020-12 and SHOULD document any others.
  A client that does not support a declared dialect must return an error rather
  than guess.

**The spec places no restriction on which JSON Schema features a tool may use.**
It defers entirely to the declared dialect. This package invents no keyword
restrictions to compensate.

## `$ref` resolution

JSON Schema 2020-12 lets `$ref` point at an absolute URI. MCP adds security
rules:

- Implementations **MUST NOT** automatically dereference a `$ref` that resolves
  to a network URI.
- An opt-in fetching mode MAY exist but MUST be off by default.
- A schema that fails to validate because of an unresolved external `$ref`
  **SHOULD be rejected** rather than silently treated as permissive.

SchemaPort resolves no references at all. See
[`compatibility-rules.md`](compatibility-rules.md) for the two `$ref` rules
this produces.

## Composition keyword bounds

The spec says implementations SHOULD bound composition-keyword cost (maximum
depth, a cap on subschema count, or a time budget) to prevent a malicious
schema becoming a denial-of-service vector. **It names no numeric limit.** This
package therefore implements no depth or subschema rule — inventing a threshold
the spec does not state would be a fabricated rule, not a check.

## Tool names

From [Tool Names](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names),
all **SHOULD**-level:

- 1 to 128 characters inclusive.
- Case-sensitive.
- Only uppercase and lowercase ASCII letters, digits, underscore (`_`), hyphen
  (`-`) and dot (`.`).
- No spaces, commas or other special characters.
- Unique within a server.

Because these are SHOULD, this package reports violations as **warnings**, not
errors. Uniqueness is a whole-server property and cannot be checked from one
tool; it is not checked here.

## Documented limits

- **Tool name:** 1–128 characters (SHOULD).
- **Description:** the specification states **no** length limit. None is
  enforced here.
- **`x-mcp-header` value:** non-empty HTTP field-name token, and integer values
  must fit IEEE-754 double-precision safe-integer range.

## `outputSchema` semantics

`outputSchema` is optional. When present:

- Servers **MUST** provide structured results (`structuredContent`) conforming
  to it.
- Clients **SHOULD** validate structured results against it.

`structuredContent` may be any JSON value — object, array, string, number,
boolean or null — that conforms to `outputSchema`. A tool returning structured
content SHOULD also return the serialized JSON in a `TextContent` block, for
backwards compatibility.

Structured content is **not** required merely because `outputSchema` is absent;
`outputSchema` constrains `structuredContent` when both are present.

SchemaPort's `CanonicalTool` has no output-schema field, so `compile()` never
emits `outputSchema`. See [`limitations.md`](limitations.md).

## `tools/list` response shape

A `tools/list` response is a JSON-RPC 2.0 result. The `result` object is a
`ListToolsResult`, which in revision 2026-07-28 extends both `PaginatedResult`
and `CacheableResult`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resultType": "complete",
    "tools": [
      {
        "name": "get_weather",
        "title": "Weather Information Provider",
        "description": "Get current weather information for a location",
        "inputSchema": {
          "type": "object",
          "properties": { "location": { "type": "string" } },
          "required": ["location"]
        }
      }
    ],
    "nextCursor": "next-page-cursor",
    "ttlMs": 300000,
    "cacheScope": "public"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `resultType` | **yes** | `"complete"` for an ordinary result. New in 2026-07-28 |
| `tools` | **yes** | May be empty |
| `nextCursor` | no | Opaque pagination token |
| `ttlMs` | **yes** | Cache freshness hint in ms, `>= 0`. New in 2026-07-28 |
| `cacheScope` | **yes** | `"public"` or `"private"`. New in 2026-07-28 |
| `_meta` | no | Servers SHOULD include `io.modelcontextprotocol/serverInfo` |

`resultType`, `ttlMs` and `cacheScope` did not exist in revision `2025-06-18`.
A result written against that older revision will fail
`validateToolsListResult`, which is the intended behaviour.

Servers SHOULD return tools in a deterministic order, so clients can cache the
list and LLM prompt caches hit more often. SchemaPort's compilation is
deterministic, which supports this.

## `x-mcp-header`

The one place the spec requires a client to reject a tool definition outright.
`x-mcp-header` sits inside a property's schema and names the `Mcp-Param-{name}`
HTTP header the argument is mirrored into on the Streamable HTTP transport. Its
value:

- MUST NOT be empty.
- MUST match HTTP field-name token syntax (`1*tchar`,
  [RFC 9110 §5.1](https://datatracker.ietf.org/doc/html/rfc9110#section-5.1)).
- MUST NOT contain control characters, including CR or LF.
- MUST be case-insensitively unique among all `x-mcp-header` values in one
  `inputSchema`.
- MUST only be applied to primitive-typed parameters — integer, string or
  boolean. `number` is explicitly not permitted.
- MUST only be applied to properties statically reachable from the schema root.

> Clients using the Streamable HTTP transport **MUST** reject tool definitions
> where any `x-mcp-header` value violates these constraints.

Clients on other transports (for example stdio) MAY ignore `x-mcp-header`
entirely, so a violation only bites over Streamable HTTP. This package still
reports it as an `error`.

## Sources

| Topic | URL |
|---|---|
| Tools | https://modelcontextprotocol.io/specification/2026-07-28/server/tools |
| Tool names | https://modelcontextprotocol.io/specification/2026-07-28/server/tools#tool-names |
| `x-mcp-header` | https://modelcontextprotocol.io/specification/2026-07-28/server/tools#x-mcp-header |
| JSON Schema usage | https://modelcontextprotocol.io/specification/2026-07-28/basic#json-schema-usage |
| `$ref` resolution | https://modelcontextprotocol.io/specification/2026-07-28/basic#ref-resolution |
| Schema reference | https://modelcontextprotocol.io/specification/2026-07-28/schema |
| `schema.ts` source of truth | https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts |
| Changelog for this revision | https://modelcontextprotocol.io/specification/2026-07-28/changelog |
| Versioning | https://modelcontextprotocol.io/specification/versioning |
| RFC 9110 §5.6.2 (`token`/`tchar`) | https://www.rfc-editor.org/rfc/rfc9110.html#section-5.6.2 |
