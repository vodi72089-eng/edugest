const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_DIR = __dirname;
const batFile = path.join(PROJECT_DIR, 'start-all.bat');
const WA_DIR = path.join(PROJECT_DIR, 'mini-services', 'whatsapp-server');

console.log('');
console.log('  ╔══════════════════════════════════════╗');
console.log('  ║        EduGest - Demarrage           ║');
console.log('  ╚══════════════════════════════════════╝');
console.log('');

if (process.platform === 'win32' && fs.existsSync(batFile)) {
  // Windows : launch the .bat file which handles everything properly
  spawn('cmd.exe', ['/c', batFile], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }).unref();
  console.log('  Fenetres ouvertes via start-all.bat');
} else {
  // Fallback direct (Windows sans .bat, ou POSIX)
  const useBun = spawnSafe('bun', ['--version']);

  console.log('  [1] WhatsApp Server (port 3001) - mini-services/whatsapp-server');
  if (fs.existsSync(path.join(WA_DIR, 'package.json'))) {
    if (useBun) {
      spawn('bun', ['run', 'dev'], {
        cwd: WA_DIR,
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      console.log('      [!] Bun introuvable (https://bun.sh) - serveur WhatsApp ignore.');
    }
  } else {
    console.log('      [!] mini-services/whatsapp-server introuvable - serveur WhatsApp ignore.');
  }

  console.log('  [2] Next.js (port 3000)');
  spawn('npx', ['next', 'dev', '-p', '3000', '--webpack'], {
    cwd: PROJECT_DIR,
    detached: true,
    stdio: 'ignore',
  }).unref();
}

console.log('');
console.log('  Patientez ~30 secondes pour le premier chargement.');
console.log('');
console.log('    App       : http://localhost:3000  (section Connexion WhatsApp dans le menu)');
console.log('    WhatsApp  : http://localhost:3001/status  (API - en-tete x-api-key requis)');
console.log('');

/** Retourne true si la commande s'exécute correctement, false sinon. */
function spawnSafe(cmd, args) {
  try {
    const r = require('child_process').spawnSync(cmd, args, { stdio: 'ignore' });
    return !r.error;
  } catch {
    return false;
  }
}
