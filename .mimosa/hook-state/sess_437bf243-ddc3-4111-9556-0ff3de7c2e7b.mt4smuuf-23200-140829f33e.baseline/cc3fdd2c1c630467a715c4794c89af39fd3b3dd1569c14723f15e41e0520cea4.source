const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_DIR = __dirname;
const batFile = path.join(PROJECT_DIR, 'start-all.bat');

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║        EduGest - Demarrage           ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');

if (fs.existsSync(batFile)) {
  // Launch the .bat file which handles everything properly
  spawn('cmd.exe', ['/c', batFile], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
  console.log('  Fenetres ouvertes via start-all.bat');
} else {
  // Fallback: launch directly
  console.log('  [1] WhatsApp Server (port 3001)');
  spawn('cmd.exe', ['/c', 'cd /d', PROJECT_DIR, '&&', 'node', 'whatsapp-server.js'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();

  console.log('  [2] Next.js (port 3000)');
  spawn('cmd.exe', ['/c', 'cd /d', PROJECT_DIR, '&&', 'npm run dev'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
}

console.log('');
console.log('  Patientez ~30 secondes pour le premier chargement.');
console.log('');
console.log('    App       : http://localhost:3000');
console.log('    WhatsApp  : http://localhost:3001/qr-page');
console.log('');
