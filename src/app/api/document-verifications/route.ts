import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { registerDocument, type DocumentType } from '@/lib/document-verify';

// POST /api/document-verifications — enregistre un document officiel et renvoie
// son URL de vérification (utilisé par la carte d'identité élève).
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const body = await request.json().catch(() => ({}));
    const { type, studentId, schoolId, metadata } = body;

    if (!type || !studentId || !schoolId) {
      return NextResponse.json({ error: 'type, studentId et schoolId sont requis' }, { status: 400 });
    }

    // Sécurité : l'appelant doit appartenir à l'école concernée
    const user = authResult.user;
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const doc = await registerDocument({ type: type as DocumentType, schoolId, studentId, metadata });
    return NextResponse.json({ data: doc });
  } catch (error) {
    console.error('[document-verifications] erreur:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
