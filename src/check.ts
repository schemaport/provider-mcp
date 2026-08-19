/**
 * MCP compatibility rules.
 *
 * MCP defers almost entirely to JSON Schema: `inputSchema` may carry any JSON
 * Schema 2020-12 keyword alongside `type`, including composition, conditional
 * and reference keywords. The rules below therefore only cover the places
 * where the specification itself states a requirement — the root `type`, tool
 * naming guidance, `$ref` resolution, the schema dialect, and the
 * `x-mcp-header` extension. Most canonical tools are simply compatible, and
 * that is the correct result rather than a gap in this file.
 */

import type { CanonicalTool, Diagnostic, JsonSchema } from '@schemaport/core';
import {
  asSchema,
  collectSchemas,
  compilable,
  diagnostic,
  isPlainObject,
  joinPath,
  notCompilable,
  schemaTypes,
  sortDiagnostics,
} from '@schemaport/core';

import {
  CODES,
  DOC_URLS,
  HTTP_TOKEN_PATTERN,
  JSON_SCHEMA_2020_12_IDS,
  PROVIDER_ID,
  TOOL_NAME_MAX_LENGTH,
  TOOL_NAME_MIN_LENGTH,
  TOOL_NAME_PATTERN,
  X_MCP_HEADER_KEYWORD,
  X_MCP_HEADER_TYPES,
} from './rules.js';

/** How the canonical root `type` relates to MCP's required `type: "object"`. */
export type RootTypeVerdict =
  | 'literal-object'
  | 'missing'
  | 'array-object-only'
  | 'union-with-object'
  | 'not-object';

/**
 * Classify the root `type` of an input schema.
 *
 * MCP requires the literal string `"object"` at the root of `inputSchema`
 * (`inputSchema: { $schema?: string; type: "object"; [key: string]: unknown }`
 * in the official `schema.ts`). Canonical schemas may express the same
 * intention slightly differently, so compile() can repair some of these.
 */
export function classifyRootType(schema: JsonSchema): RootTypeVerdict {
  if (schema['type'] === 'object') return 'literal-object';
  const types = schemaTypes(schema);
  if (schema['type'] === undefined) return 'missing';
  if (!types.includes('object')) return 'not-object';
  return types.length === 1 ? 'array-object-only' : 'union-with-object';
}

/** Run every implemented MCP rule against a canonical tool. */
export function checkMcpTool(tool: CanonicalTool): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const emit = (init: Omit<Parameters<typeof diagnostic>[0], 'providerId' | 'toolName'>): void => {
    diagnostics.push(diagnostic({ providerId: PROVIDER_ID, toolName: tool.name, ...init }));
  };

  checkToolName(tool, emit);

  const inputSchema = asSchema(tool.inputSchema);
  if (!inputSchema) return sortDiagnostics(diagnostics);

  checkRootType(inputSchema, emit);
  checkSchemaDialect(inputSchema, emit);

  const subschemas = collectSchemas(inputSchema, 'inputSchema');
  checkRefs(inputSchema, subschemas, emit);
  checkXMcpHeaders(subschemas, emit);
  checkNullable(subschemas, emit);

  return sortDiagnostics(diagnostics);
}

/* -------------------------------------------------------------------------- */
/* Tool names                                                                  */
/* -------------------------------------------------------------------------- */

type Emit = (init: Omit<Parameters<typeof diagnostic>[0], 'providerId' | 'toolName'>) => void;

function checkToolName(tool: CanonicalTool, emit: Emit): void {
  const { name } = tool;

  if (name.length < TOOL_NAME_MIN_LENGTH || name.length > TOOL_NAME_MAX_LENGTH) {
    emit({
      severity: 'warning',
      code: CODES.toolNameLength,
      message:
        `Tool name is ${name.length} characters. MCP tool names SHOULD be between ` +
        `${TOOL_NAME_MIN_LENGTH} and ${TOOL_NAME_MAX_LENGTH} characters.`,
      path: joinPath('name'),
      compile: notCompilable('The tool name is emitted unchanged; renaming a tool changes its identity.'),
      docsUrl: DOC_URLS.toolNames,
    });
  }

  if (name.length > 0 && !TOOL_NAME_PATTERN.test(name)) {
    emit({
      severity: 'warning',
      code: CODES.toolNameCharacters,
      message:
        `Tool name \`${name}\` uses characters outside the set MCP recommends. ` +
        'Tool names SHOULD contain only ASCII letters, digits, underscore (_), hyphen (-) and dot (.).',
      path: joinPath('name'),
      compile: notCompilable('The tool name is emitted unchanged; renaming a tool changes its identity.'),
      docsUrl: DOC_URLS.toolNames,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Root type                                                                   */
/* -------------------------------------------------------------------------- */

function checkRootType(inputSchema: JsonSchema, emit: Emit): void {
  const verdict = classifyRootType(inputSchema);
  if (verdict === 'literal-object') return;

  const path = joinPath('inputSchema', 'type');

  if (verdict === 'missing') {
    emit({
      severity: 'error',
      code: CODES.inputSchemaMissingType,
      message:
        '`inputSchema` does not declare a type. MCP requires `"type": "object"` at the root ' +
        'because tool arguments are always a JSON object.',
      path,
      compile: compilable('Emits `"type": "object"` at the root of `inputSchema`.'),
      docsUrl: DOC_URLS.tools,
    });
    return;
  }

  if (verdict === 'array-object-only') {
    emit({
      severity: 'error',
      code: CODES.inputSchemaTypeNotLiteralObject,
      message:
        '`inputSchema.type` is an array containing only `"object"`. MCP requires the literal ' +
        'string `"object"` at the root of `inputSchema`.',
      path,
      compile: compilable('Emits `"type": "object"` as a string instead of a single-element array.'),
      docsUrl: DOC_URLS.tools,
    });
    return;
  }

  if (verdict === 'union-with-object') {
    const others = schemaTypes(inputSchema).filter((type) => type !== 'object');
    emit({
      severity: 'warning',
      code: CODES.inputSchemaTypeUnion,
      message:
        `\`inputSchema.type\` also allows ${others.map((type) => `\`${type}\``).join(', ')}. ` +
        'MCP requires the literal string `"object"` at the root, so the compiled tool accepts ' +
        'objects only.',
      path,
      compile: compilable('Emits `"type": "object"`, dropping the other root types from the union.'),
      docsUrl: DOC_URLS.tools,
    });
    return;
  }

  emit({
    severity: 'error',
    code: CODES.inputSchemaNotObject,
    message:
      '`inputSchema` does not allow objects at the root. MCP tool arguments are always a JSON ' +
      'object, so `inputSchema` must declare `"type": "object"`.',
    path,
    compile: notCompilable(
      'Refused: rewriting a non-object root schema would change what the tool accepts.',
    ),
    docsUrl: DOC_URLS.tools,
  });
}

/* -------------------------------------------------------------------------- */
/* Schema dialect                                                              */
/* -------------------------------------------------------------------------- */

function checkSchemaDialect(inputSchema: JsonSchema, emit: Emit): void {
  const declared = inputSchema['$schema'];
  if (declared === undefined) return;
  if (typeof declared === 'string' && JSON_SCHEMA_2020_12_IDS.includes(declared)) return;

  emit({
    severity: 'warning',
    code: CODES.nonDefaultSchemaDialect,
    message:
      `\`inputSchema.$schema\` declares ${JSON.stringify(declared)}. MCP implementations MUST ` +
      'support JSON Schema 2020-12 but only SHOULD document any other dialect, so support for ' +
      'this one varies by client.',
    path: joinPath('inputSchema', '$schema'),
    compile: notCompilable('`$schema` is emitted unchanged; SchemaPort does not translate dialects.'),
    docsUrl: DOC_URLS.jsonSchemaUsage,
  });
}

/* -------------------------------------------------------------------------- */
/* $ref                                                                        */
/* -------------------------------------------------------------------------- */

function checkRefs(
  root: JsonSchema,
  subschemas: readonly { schema: JsonSchema; path: string }[],
  emit: Emit,
): void {
  for (const { schema, path } of subschemas) {
    const ref = schema['$ref'];
    if (typeof ref !== 'string') continue;

    const refPath = joinPath(path, '$ref');

    if (!ref.startsWith('#')) {
      emit({
        severity: 'warning',
        code: CODES.externalRef,
        message:
          `\`$ref\` points outside this tool's schema (${ref}). MCP implementations MUST NOT ` +
          'automatically dereference non-local `$ref` values, and SHOULD reject a schema that ' +
          'fails to validate because of one.',
        path: refPath,
        compile: notCompilable('`$ref` is emitted unchanged; SchemaPort does not resolve references.'),
        docsUrl: DOC_URLS.refResolution,
      });
      continue;
    }

    if (resolvesLocally(root, ref)) continue;

    emit({
      severity: 'warning',
      code: CODES.unresolvableRef,
      message:
        `\`$ref\` (${ref}) does not resolve to a subschema inside this tool's \`inputSchema\`. ` +
        'A schema that fails to validate because of an unresolved `$ref` SHOULD be rejected ' +
        'rather than treated as permissive.',
      path: refPath,
      compile: notCompilable('`$ref` is emitted unchanged; SchemaPort does not resolve references.'),
      docsUrl: DOC_URLS.refResolution,
    });
  }
}

/**
 * Resolve a same-document `$ref` against `root`.
 *
 * Supports the root pointer (`#`), JSON Pointer fragments (`#/$defs/Name`) and
 * `$anchor` fragments (`#Name`). Anything else is reported as unresolvable.
 */
function resolvesLocally(root: JsonSchema, ref: string): boolean {
  if (ref === '#' || ref === '#/') return true;

  if (ref.startsWith('#/')) {
    return resolvePointer(root, ref.slice(2)) !== undefined;
  }

  const anchor = ref.slice(1);
  if (anchor.length === 0) return false;
  return collectSchemas(root, 'inputSchema').some((entry) => entry.schema['$anchor'] === anchor);
}

function resolvePointer(root: JsonSchema, pointer: string): unknown {
  let current: unknown = root;
  for (const rawSegment of pointer.split('/')) {
    const segment = decodeURIComponent(rawSegment).replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (!isPlainObject(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

/* -------------------------------------------------------------------------- */
/* x-mcp-header                                                                */
/* -------------------------------------------------------------------------- */

function checkXMcpHeaders(
  subschemas: readonly { schema: JsonSchema; path: string }[],
  emit: Emit,
): void {
  const seen = new Map<string, string>();

  for (const { schema, path } of subschemas) {
    if (!(X_MCP_HEADER_KEYWORD in schema)) continue;

    const value = schema[X_MCP_HEADER_KEYWORD];
    const headerPath = joinPath(path, X_MCP_HEADER_KEYWORD);

    if (typeof value !== 'string' || value.length === 0 || !HTTP_TOKEN_PATTERN.test(value)) {
      emit({
        severity: 'error',
        code: CODES.xMcpHeaderInvalid,
        message:
          `\`${X_MCP_HEADER_KEYWORD}\` must be a non-empty HTTP field-name token ` +
          '(RFC 9110 §5.1). Clients on the Streamable HTTP transport MUST exclude a tool whose ' +
          `\`${X_MCP_HEADER_KEYWORD}\` value is invalid.`,
        path: headerPath,
        compile: notCompilable(
          `Refused: removing \`${X_MCP_HEADER_KEYWORD}\` would silently drop header routing the author asked for.`,
        ),
        docsUrl: DOC_URLS.xMcpHeader,
      });
      continue;
    }

    const key = value.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      emit({
        severity: 'error',
        code: CODES.xMcpHeaderDuplicate,
        message:
          `\`${X_MCP_HEADER_KEYWORD}\` value \`${value}\` collides case-insensitively with the ` +
          `one at \`${previous}\`. These values MUST be unique within one \`inputSchema\`.`,
        path: headerPath,
        compile: notCompilable(
          `Refused: SchemaPort cannot choose which \`${X_MCP_HEADER_KEYWORD}\` value to drop.`,
        ),
        docsUrl: DOC_URLS.xMcpHeader,
      });
    } else {
      seen.set(key, headerPath);
    }

    const types = schemaTypes(schema);
    if (types.length !== 1 || !X_MCP_HEADER_TYPES.includes(types[0] as string)) {
      emit({
        severity: 'error',
        code: CODES.xMcpHeaderUnsupportedType,
        message:
          `\`${X_MCP_HEADER_KEYWORD}\` may only be applied to a property declaring exactly one of ` +
          `${X_MCP_HEADER_TYPES.map((type) => `\`${type}\``).join(', ')}. ` +
          '`number` is explicitly not permitted.',
        path: headerPath,
        compile: notCompilable(
          `Refused: SchemaPort will not change a property's type to make \`${X_MCP_HEADER_KEYWORD}\` valid.`,
        ),
        docsUrl: DOC_URLS.xMcpHeader,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* nullable                                                                    */
/* -------------------------------------------------------------------------- */

function checkNullable(
  subschemas: readonly { schema: JsonSchema; path: string }[],
  emit: Emit,
): void {
  for (const { schema, path } of subschemas) {
    if (schema['nullable'] === undefined) continue;
    emit({
      severity: 'info',
      code: CODES.nullableKeywordIgnored,
      message:
        '`nullable` is an OpenAPI 3.0 keyword, not a JSON Schema 2020-12 one. MCP validators ' +
        'ignore it. Use `"type": ["<type>", "null"]` or `anyOf` to allow null.',
      path: joinPath(path, 'nullable'),
      compile: notCompilable('`nullable` is emitted unchanged, alongside the rest of the schema.'),
      docsUrl: DOC_URLS.jsonSchemaUsage,
    });
  }
}
