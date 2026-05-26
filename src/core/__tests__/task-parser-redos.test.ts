import { describe, expect, it } from 'vitest';
import { parseTasksFromMarkdown } from '../task-parser.js';
import { validateTasksMarkdown } from '../task-validator.js';

describe('task parser ReDoS hardening', () => {
  it('parses deeply dotted task ids with linear logic', () => {
    const taskId = Array.from({ length: 200 }, () => '1').join('.');
    const markdown = `- [ ] ${taskId}. Harden parser\n`;

    const result = parseTasksFromMarkdown(markdown);

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe(taskId);
    expect(result.tasks[0].description).toBe('Harden parser');
  });

  it('handles MDX escaped task separators without regex backtracking', () => {
    const result = parseTasksFromMarkdown('- [ ] 1\\. Escaped separator\n');

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('1');
    expect(result.tasks[0].description).toBe('Escaped separator');
  });

  it('validates deeply dotted task ids with linear logic', () => {
    const taskId = Array.from({ length: 200 }, () => '1').join('.');
    const markdown = `- [ ] ${taskId}. Validate parser\n  - _Requirements: 1.1_\n`;

    const result = validateTasksMarkdown(markdown);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
