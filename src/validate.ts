/**
 * Local protocol-shape validation for MCP.
 *
 * MCP has no hosted API, so there is nothing to probe. These helpers stand in
 * for probing: they answer "is this the shape an MCP client will accept?"
 * entirely offline, with no transport, no client and no network access.
 *
 * They check MUST-level structure from specification revision 2026-07-28 only.
 * They deliberately do **not** reject unknown keys — `Tool` and
 * `ListToolsResult` are open objects that carry `_meta` and extension keys —
 * and they do not enforce SHOULD-level guidance such as tool-name character
 * limits. Use `mcpProvider.check()` for that.
 */

import { isPlainObject } from '@schemaport/core';

import type { McpValidationResult } from './types.js';

const CACHE_SCOPES = ['public', 'private'];
const ICON_THEMES = ['light', 'dark'];
const ANNOTATION_HINTS = [
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
] as const;

/**
 * Validate one MCP `Tool` object.
 *
 * Checks, all MUST-level in revision 2026-07-28:
 * - the value is a JSON object;
 * - `name` is present and a non-empty string;
 * - `title` and `description` are strings when present;
 * - `inputSchema` is present, is a JSON object, and declares the literal
 *   `"type": "object"`;
 * - `inputSchema.$schema` and `outputSchema.$schema` are strings when present;
 * - `outputSchema` is a JSON object when present (it need not be an object
 *   schema — any JSON Schema 2020-12 is allowed);
 * - `annotations` is a JSON object whose known hint fields have the right
 *   types, when present;
 * - `icons` is an array of objects each carrying a non-empty string `src`,
 *   when present;
 * - `_meta` is a JSON object when present.
 *
 * It does not validate the schemas themselves against a JSON Schema
 * meta-schema, resolve `$ref`, or apply SHOULD-level naming guidance.
 */
export function validateMcpTool(value: unknown, path = 'tool'): McpValidationResult {
  const errors: string[] = [];
  const at = (...segments: string[]): string => [path, ...segments].join('.');

  if (!isPlainObject(value)) {
    return { valid: false, errors: [`${path}: must be a JSON object.`] };
  }

  if (typeof value['name'] !== 'string') {
    errors.push(`${at('name')}: is required and must be a string.`);
  } else if (value['name'].length === 0) {
    errors.push(`${at('name')}: must not be empty.`);
  }

  for (const key of ['title', 'description'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      errors.push(`${at(key)}: must be a string when present.`);
    }
  }

  errors.push(...validateInputSchema(value['inputSchema'], at('inputSchema')));
  errors.push(...validateOutputSchema(value['outputSchema'], at('outputSchema')));
  errors.push(...validateAnnotations(value['annotations'], at('annotations')));
  errors.push(...validateIcons(value['icons'], at('icons')));

  if (value['_meta'] !== undefined && !isPlainObject(value['_meta'])) {
    errors.push(`${at('_meta')}: must be a JSON object when present.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the bare `result` object of a `tools/list` response.
 *
 * This is the `ListToolsResult`, **not** the JSON-RPC envelope: pass
 * `response.result`, not `response`.
 *
 * Checks, all MUST-level in revision 2026-07-28:
 * - the value is a JSON object;
 * - `resultType` is present and equal to `"complete"`;
 * - `tools` is present, is an array, and every entry passes
 *   {@link validateMcpTool};
 * - `ttlMs` is present and is a number `>= 0` (`CacheableResult`);
 * - `cacheScope` is present and is `"public"` or `"private"`
 *   (`CacheableResult`);
 * - `nextCursor` is a string when present (`PaginatedResult`);
 * - `_meta` is a JSON object when present.
 *
 * It does not check pagination consistency, tool-name uniqueness across the
 * array (a SHOULD), or the JSON-RPC framing around the result.
 */
export function validateToolsListResult(value: unknown, path = 'result'): McpValidationResult {
  const errors: string[] = [];
  const at = (...segments: string[]): string => [path, ...segments].join('.');

  if (!isPlainObject(value)) {
    return { valid: false, errors: [`${path}: must be a JSON object.`] };
  }

  if (value['resultType'] === undefined) {
    errors.push(`${at('resultType')}: is required and must be "complete".`);
  } else if (value['resultType'] !== 'complete') {
    errors.push(
      `${at('resultType')}: must be "complete" for a tools/list result, got ${JSON.stringify(
        value['resultType'],
      )}.`,
    );
  }

  const tools = value['tools'];
  if (tools === undefined) {
    errors.push(`${at('tools')}: is required and must be an array.`);
  } else if (!Array.isArray(tools)) {
    errors.push(`${at('tools')}: must be an array.`);
  } else {
    tools.forEach((tool, index) => {
      errors.push(...validateMcpTool(tool, `${at('tools')}[${index}]`).errors);
    });
  }

  const ttlMs = value['ttlMs'];
  if (ttlMs === undefined) {
    errors.push(`${at('ttlMs')}: is required and must be a number of milliseconds >= 0.`);
  } else if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs < 0) {
    errors.push(`${at('ttlMs')}: must be a finite number >= 0.`);
  }

  const cacheScope = value['cacheScope'];
  if (cacheScope === undefined) {
    errors.push(`${at('cacheScope')}: is required and must be "public" or "private".`);
  } else if (typeof cacheScope !== 'string' || !CACHE_SCOPES.includes(cacheScope)) {
    errors.push(`${at('cacheScope')}: must be "public" or "private".`);
  }

  if (value['nextCursor'] !== undefined && typeof value['nextCursor'] !== 'string') {
    errors.push(`${at('nextCursor')}: must be a string when present.`);
  }

  if (value['_meta'] !== undefined && !isPlainObject(value['_meta'])) {
    errors.push(`${at('_meta')}: must be a JSON object when present.`);
  }

  return { valid: errors.length === 0, errors };
}

/* -------------------------------------------------------------------------- */

function validateInputSchema(value: unknown, path: string): string[] {
  if (value === undefined) return [`${path}: is required and must be a JSON Schema object.`];
  if (!isPlainObject(value)) return [`${path}: must be a JSON Schema object.`];

  const errors: string[] = [];
  if (value['type'] !== 'object') {
    errors.push(
      `${path}.type: must be the literal string "object"; tool arguments are always a JSON object.`,
    );
  }
  if (value['$schema'] !== undefined && typeof value['$schema'] !== 'string') {
    errors.push(`${path}.$schema: must be a string when present.`);
  }
  return errors;
}

function validateOutputSchema(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!isPlainObject(value)) return [`${path}: must be a JSON Schema object when present.`];
  if (value['$schema'] !== undefined && typeof value['$schema'] !== 'string') {
    return [`${path}.$schema: must be a string when present.`];
  }
  return [];
}

function validateAnnotations(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!isPlainObject(value)) return [`${path}: must be a JSON object when present.`];

  const errors: string[] = [];
  if (value['title'] !== undefined && typeof value['title'] !== 'string') {
    errors.push(`${path}.title: must be a string when present.`);
  }
  for (const hint of ANNOTATION_HINTS) {
    if (value[hint] !== undefined && typeof value[hint] !== 'boolean') {
      errors.push(`${path}.${hint}: must be a boolean when present.`);
    }
  }
  return errors;
}

function validateIcons(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${path}: must be an array when present.`];

  const errors: string[] = [];
  value.forEach((icon, index) => {
    const iconPath = `${path}[${index}]`;
    if (!isPlainObject(icon)) {
      errors.push(`${iconPath}: must be a JSON object.`);
      return;
    }
    if (typeof icon['src'] !== 'string') {
      errors.push(`${iconPath}.src: is required and must be a string.`);
    } else if (icon['src'].length === 0) {
      errors.push(`${iconPath}.src: must not be empty.`);
    }
    if (icon['mimeType'] !== undefined && typeof icon['mimeType'] !== 'string') {
      errors.push(`${iconPath}.mimeType: must be a string when present.`);
    }
    if (icon['sizes'] !== undefined) {
      if (!Array.isArray(icon['sizes']) || icon['sizes'].some((size) => typeof size !== 'string')) {
        errors.push(`${iconPath}.sizes: must be an array of strings when present.`);
      }
    }
    if (
      icon['theme'] !== undefined &&
      (typeof icon['theme'] !== 'string' || !ICON_THEMES.includes(icon['theme']))
    ) {
      errors.push(`${iconPath}.theme: must be "light" or "dark" when present.`);
    }
  });
  return errors;
}
