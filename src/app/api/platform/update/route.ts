import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

// POST /api/platform/update — met à jour le code local depuis GitHub
// (git stash de sécurité + git pull --ff-only) et renvoie la SORTIE COMPLÈTE
// des commandes : l'utilisateur voit exactement ce qui se passe, même sans
// savoir ouvrir un terminal. Réservé au super administrateur plateforme.
// ⚠️ db/ (base de données) n'est PAS suivie par git → aucune mise à jour ne
// touche jamais les données de l'école.
//
// ⚠️ CLOUDFLARE WORKERS : child_process (git) n'existe pas sur workerd. La
// mise à jour se fait alors par CI (git push → Cloudflare Workers Builds).
// On détecte l'environnement et on répond 501 avec un message explicite
// (jamais de coupure silencieuse). L'import de child_process est dynamique
// (specifier variable) pour que Vite ne l'analyse pas au build.
const CP_MOD = 'child_process';
const UTIL_MOD = 'util';

async function runningOnWorkers(): Promise<boolean> {
  try {
    await import(CP_MOD);
    return false; // Node : child_process disponible
  } catch {
    return true; // Workers : child_process absent
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    // Garde Workers : pas de shell → mise à jour impossible.
    if (await runningOnWorkers()) {
      return NextResponse.json({
        error: 'Mise à jour impossible sur Cloudflare Workers (pas de shell). Déploiement via CI : git push → Cloudflare Workers Builds.',
      }, { status: 501 });
    }

    const { exec } = await import(CP_MOD);
    const { promisify } = await import(UTIL_MOD);
    const run = promisify(exec);

    const cwd = process.cwd();
    const lines: string[] = [];

    // 1) Commit actuel avant mise à jour
    try {
      const before = await run('git log -1 --oneline', { cwd, timeout: 15000 });
      lines.push('Code actuel : ' + before.stdout.trim());
    } catch {
      lines.push('Code actuel : (information indisponible)');
    }

    // 2) Stash défensif : d'éventuelles modifications locales de fichiers de
    //    code ne doivent pas bloquer la mise à jour (elles restent récupérables
    //    via « git stash pop » ; la base de données n'est pas concernée).
    try {
      const stash = await run('git stash push -m "auto-update-edugest"', { cwd, timeout: 30000 });
      const out = (stash.stdout || '').trim();
      if (out && !/no local changes/i.test(out)) lines.push(out);
    } catch {
      /* stash impossible (ex. pas un dépôt git) — on tente quand même le pull */
    }

    // 3) Mise à jour propre (fast-forward uniquement)
    let pullOk = true;
    try {
      const pull = await run('git pull --ff-only origin main', { cwd, timeout: 120000 });
      if (pull.stdout?.trim()) lines.push(pull.stdout.trim());
      if (pull.stderr?.trim()) lines.push(pull.stderr.trim());
    } catch (e: unknown) {
      pullOk = false;
      const err = e as { stdout?: string; stderr?: string; message?: string };
      lines.push('❌ ÉCHEC de la mise à jour :');
      if (err.stdout?.trim()) lines.push(err.stdout.trim());
      if (err.stderr?.trim()) lines.push(err.stderr.trim());
      if (!err.stdout?.trim() && !err.stderr?.trim()) lines.push(err.message || 'Erreur inconnue');
    }

    // 4) Commit actuel après mise à jour
    try {
      const after = await run('git log -1 --oneline', { cwd, timeout: 15000 });
      lines.push('Code après : ' + after.stdout.trim());
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: pullOk,
      output: lines.join('\n'),
      message: pullOk
        ? 'Mise à jour appliquée — faites Ctrl+Shift+R dans le navigateur pour recharger l’application'
        : undefined,
    }, { status: pullOk ? 200 : 500 });
  } catch (error) {
    console.error('Error updating platform:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
