import { refundOrderTool } from '@schemaport/core';
import { describe, expect, it } from 'vitest';

import defaultExport, { MCP_DOCS, MCP_SPEC_REVISION, mcpProvider } from '../src/index.js';

describe('provider identity', () => {
  it('exposes the contracted id and display name', () => {
    expect(mcpProvider.id).toBe('mcp');
    expect(mcpProvider.displayName).toBe('MCP');
  });

  it('is the default export as well', () => {
    expect(defaultExport).toBe(mcpProvider);
  });

  it('records when the rules were reviewed, separately from the spec revision', () => {
    expect(mcpProvider.rulesReviewedAt).toBe('2026-08-20');
    expect(MCP_SPEC_REVISION).toBe('2026-07-28');
  });

  it('does not declare an API key environment variable', () => {
    expect(mcpProvider.apiKeyEnvVar).toBeUndefined();
  });

  it('cites only official documentation, all on the reviewed revision', () => {
    expect(MCP_DOCS.length).toBeGreaterThan(0);
    for (const doc of MCP_DOCS) {
      expect(doc.url).toMatch(
        /^https:\/\/(modelcontextprotocol\.io|github\.com\/modelcontextprotocol)\//,
      );
      expect(doc.title.length).toBeGreaterThan(0);
    }
  });
});

describe('probe()', () => {
  it('is implemented and always skips: MCP has no hosted API', async () => {
    const result = await mcpProvider.probe?.(refundOrderTool);
    expect(result).toBeDefined();
    expect(result?.status).toBe('skipped');
    expect(result?.providerId).toBe('mcp');
    expect(result?.toolName).toBe('refund_order');
    expect(result?.schemaAccepted).toBe(false);
    expect(result?.toolCallReturned).toBe(false);
    expect(result?.notes.join(' ')).toContain('no hosted API');
  });

  it('skips regardless of options, and reads no environment variable', async () => {
    const withOptions = await mcpProvider.probe?.(refundOrderTool, {
      apiKey: 'ignored',
      model: 'ignored',
    });
    const without = await mcpProvider.probe?.(refundOrderTool);
    expect(JSON.stringify(withOptions)).toBe(JSON.stringify(without));
  });
});
