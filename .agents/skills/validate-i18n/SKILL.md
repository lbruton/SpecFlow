---
name: validate-i18n
description: Run the i18n validation script to check for missing, extra, or misformatted translation keys before publishing
---

Run the i18n validator for the specflow project:

```bash
cd /Volumes/DATA/GitHub/specflow && node scripts/validate-i18n.js
```

Report the full output. If clean, confirm "i18n validation passed — all translation keys are consistent."

If there are failures, list them clearly grouped by:

- Missing keys (present in one locale but not another)
- Extra keys (not used in source)
- Format mismatches (e.g., interpolation variable differences)

Suggest fixes for any issues found.
