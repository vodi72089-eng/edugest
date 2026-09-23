const fs = require('fs');
const path = require('path');

const files = [
  'src/app/page.tsx',
  'src/components/views/SchoolsManagementView.tsx',
  'src/components/views/SettingsView.tsx',
  'src/components/views/PersonnelView.tsx',
];

// Additional mojibake patterns not caught by first pass
const replacements = [
  // Ã‰ (C3 + U+2030) → É
  ['\u00C3\u2030', '\u00C9'],
  // â€— → — (em-dash triple-encoded)
  ['\u00E2\u20AC\u2014', '\u2014'],
  // âœ— → ✓
  ['\u00E2\u0153\u2014', '\u2713'],
  // â€¢ → •
  ['\u00E2\u20AC\u00A2', '\u2022'],
  // â—‹ → ◯
  ['\u00E2\u2014\u2039', '\u25EF'],
  // â—† → ►
  ['\u00E2\u2014\u2020', '\u25BA'],
  // â— → ◯ (another empty circle variant)
  ['\u00E2\u2014\u0090', '\u25EF'],
  // Â° → °
  ['\u00C2\u00B0', '\u00B0'],
  // âš  → ⚠ (warning sign)
  ['\u00E2\u0161\u00A0', '\u26A0'],
  // â†' → →
  ['\u00E2\u2020\u2019', '\u2192'],
  // â† ←
  ['\u00E2\u2020\u0090', '\u2190'],
  // Ã€ (C3 + U+20AC) → À
  ['\u00C3\u20AC', '\u00C0'],
  // Ã» → »
  ['\u00C3\u00BB', '\u00BB'],
  // â‰ˆ → ≈
  ['\u00E2\u2030\u02C6', '\u2248'],
  // éé → é (double-encode fix)
  ['\u00E9\u00E9', '\u00E9'],
  // remaining Â before proper char
  ['\u00C2', ''],  // Remove stray Â (spurious)
];

let totalAll = 0;
for (const file of files) {
  const filePath = path.resolve(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let total = 0;

  for (const [from, to] of replacements) {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = content.match(regex);
    if (matches) {
      total += matches.length;
      content = content.replace(regex, to);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  totalAll += total;
  console.log(`${path.basename(filePath)}: ${total} replacements`);
}
console.log(`Total: ${totalAll}`);
