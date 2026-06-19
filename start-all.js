const { spawn } = require('child_process');

const PROJECT_DIR = __dirname;

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║        EduGest - Demarrage           ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');

// WhatsApp Server dans nouvelle fenetre PowerShell
spawn('powershell.exe', [
  '-NoExit', '-Command',
  `Set-Location "${PROJECT_DIR}"; node whatsapp-server.js`
], { stdio: 'ignore', detached: true }).unref();
console.log('  [1] WhatsApp Server (port 3001)');

// Next.js dans nouvelle fenetre PowerShell
spawn('powershell.exe', [
  '-NoExit', '-Command',
  `Set-Location "${PROJECT_DIR}"; npm run dev`
], { stdio: 'ignore', detached: true }).unref();
console.log('  [2] Next.js (port 3000)');

console.log('');
console.log('  2 fenetres PowerShell ouvertes.');
console.log('  Patientez 5 secondes puis ouvrez :');
console.log('');
console.log('    App       : http://localhost:3000');
console.log('    WhatsApp  : http://localhost:3001/qr-page');
console.log('');
