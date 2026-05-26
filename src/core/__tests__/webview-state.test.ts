import { describe, expect, it } from 'vitest';
import { serializeWebviewState } from '../../../vscode-extension/src/extension/utils/webviewState';

describe('serializeWebviewState', () => {
  it('escapes script-breaking characters in inline JSON state', () => {
    const serialized = serializeWebviewState({
      selectedText: '</script><script>alert(1)</script>',
      existingComment: {
        text: 'safe & sound',
      },
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('&');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized).selectedText).toBe('</script><script>alert(1)</script>');
  });
});
