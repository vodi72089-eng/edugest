import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { getWhatsappUsage } from '@/lib/whatsapp-usage';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/whatsapp/usage?schoolId=...
// Suivi en temps réel du quota WhatsApp : forfait, consommé ce mois, restant,
// % et date de réinitialisation. Si l'école envoie via sa propre API WhatsApp,
// limit = -1 (illimité côté EduGest — le client n'est limité que par ses tokens Meta).
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;
    if (!schoolId) return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const usage = await getWhatsappUsage(schoolId);
    return NextResponse.json({ data: usage });
  } catch (error) {
    console.error('[WhatsApp Usage] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
