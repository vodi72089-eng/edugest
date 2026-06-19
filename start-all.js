const { exec } = require('child_process');
const path = require('path');

const PROJECT_DIR = __dirname;

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║        EduGest - Démarrage           ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');

// Lancer WhatsApp Server dans une nouvelle fenêtre PowerShell
const waCmd = `Start-Process powershell -ArgumentList '-NoExit','-Command','cd \\"${PROJECT_DIR}\\"; node whatsapp-server.js'`;
exec(waCmd, (err) => {
  if (err) {
    console.error('[!] Erreur lancement WhatsApp Server:', err.message);
    console.log('     Lancez manuellement: node whatsapp-server.js');
  } else {
    console.log('  [1] WhatsApp Server démarré (port 3001)');
  }
});

// Lancer Next.js dans une nouvelle fenêtre PowerShell
const nextCmd = `Start-Process powershell -ArgumentList '-NoExit','-Command','cd \\"${PROJECT_DIR}\\"; npm run dev'`;
exec(nextCmd, (err) => {
  if (err) {
    console.error('[!] Erreur lancement Next.js:', err.message);
    console.log('     Lancez manuellement: npm run dev');
  } else {
    console.log('  [2] Next.js démarré (port 3000)');
  }
});

console.log('');
console.log('  2 fenêtres PowerShell vont s\'ouvrir.');
console.log('  Patientez quelques secondes puis ouvrez :');
console.log('');
console.log('    App       → http://localhost:3000');
console.log('    WhatsApp  → http://localhost:3001/qr-page');
console.log('');
