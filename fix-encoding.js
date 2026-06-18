const fs = require('fs');
const path = require('path');

const files = [
  'src/app/page.tsx',
  'src/components/views/SchoolsManagementView.tsx',
  'src/components/views/SettingsView.tsx',
  'src/components/views/PersonnelView.tsx',
];

const replacements = [
  ['\u00C3\u00A9', '\u00E9'], // Ã© → é
  ['\u00C3\u00A8', '\u00E8'], // Ã¨ → è
  ['\u00C3\u00A0', '\u00E0'], // Ã  → à
  ['\u00C3\u00A7', '\u00E7'], // Ã§ → ç
  ['\u00C3\u0089', '\u00C9'], // Ã‰ → É
  ['\u00C3\u00AA', '\u00EA'], // Ãª → ê
  ['\u00C3\u00B4', '\u00F4'], // Ã´ → ô
  ['\u00C3\u00B9', '\u00F9'], // Ã¹ → ù
  ['\u00C3\u0080', '\u00C0'], // Ã€ → À
  ['\u00C2\u00A9', '\u00A9'], // Â© → ©
  ['\u00C2\u00B7', '\u00B7'], // Â· → ·
  ['\u00C2\u00AB', '\u00AB'], // Â« → «
  ['\u00C2\u00BB', '\u00BB'], // Â» → »
  ['\u201C', '\u2014'], // " → — (left double quote used as em-dash)
  ['\u201D', '\u2014'], // " → —
  ['\u2018', '\u2019'], // ' → '
  ['\u00E2\u0080\u0094', '\u2014'], // â€" → —
  ['\u00E2\u0080\u0093', '\u2013'], // â€" → –
  ['\u00E2\u0080\u00A2', '\u2022'], // â€¢ → •
  ['\u00E2\u0086\u0092', '\u2192'], // â†' → →
  ['\u00E2\u0089\u0088', '\u2248'], // â‰ˆ → ≈
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

console.log(`Total: ${totalAll} replacements`);
