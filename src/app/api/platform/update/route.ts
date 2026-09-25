import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { requireRole, sanitizeError } from '@/lib/auth';

const run = promisify(exec);

// POST /api/platform/update — met à jour le code local depuis GitHub
// (git stash de sécurité + git pull --ff-only) et renvoie la SORTIE COMPLÈTE
// des commandes : l'utilisateur voit exactement ce qui se passe, même sans
// savoir ouvrir un terminal. Réservé au super administrateur plateforme.
// ⚠️ db/ (base de données) n'est PAS suivie par git → aucune mise à jour ne
// touche jamais les données de l'école.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

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
        ? 'Mise à jour appliquée — faites Ctrl+Shift+R dans le navigateur pour recharger l\u2019application'
        : undefined,
    }, { status: pullOk ? 200 : 500 });
  } catch (error) {
    console.error('Error updating platform:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
