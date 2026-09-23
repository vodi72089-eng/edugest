import { db } from './db';
import QRCode from 'qrcode';

/**
 * Registre des documents officiels EduGest.
 *
 * Chaque document PDF généré (bulletin, reçu, fiche médicale, sommation)
 * contient un QR code unique qui pointe vers `${APP_URL}/verify/document/{code}`.
 * La page publique affiche les informations du document et confirme qu'il
 * est officiel — sans compte, sans connexion.
 */

export type DocumentType = 'BULLETIN' | 'RECEIPT' | 'MEDICAL' | 'SUMMONS';

/** URL de base de l'application (fonctionne en web et en desktop). */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function documentVerifyUrl(code: string): string {
  return `${appBaseUrl()}/verify/document/${code}`;
}

interface UpsertDocumentInput {
  type: DocumentType;
  schoolId: string;
  studentId?: string | null;
  paymentRecordId?: string | null;
  trimester?: string | null;
  schoolYearId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Crée (ou met à jour) l'enregistrement de vérification d'un document et
 * renvoie son code unique. Pour un bulletin, le document est identifié de
 * façon stable par (type, studentId, trimester, schoolYearId) : rescanner un
 * bulletin régénéré réutilise la même fiche, mise à jour avec les nouvelles
 * valeurs.
 */
export async function registerDocument(input: UpsertDocumentInput): Promise<{ id: string; url: string }> {
  const metadataJson = JSON.stringify(input.metadata || {});

  if (input.type === 'BULLETIN' && input.studentId && input.trimester && input.schoolYearId) {
    const existing = await db.documentVerification.findFirst({
      where: {
        type: 'BULLETIN',
        studentId: input.studentId,
        trimester: input.trimester,
        schoolYearId: input.schoolYearId,
      },
      select: { id: true },
    });

    if (existing) {
      await db.documentVerification.update({
        where: { id: existing.id },
        data: { metadata: metadataJson },
      });
      return { id: existing.id, url: documentVerifyUrl(existing.id) };
    }

    const created = await db.documentVerification.create({
      data: {
        type: 'BULLETIN',
        schoolId: input.schoolId,
        studentId: input.studentId,
        trimester: input.trimester,
        schoolYearId: input.schoolYearId,
        metadata: metadataJson,
      },
      select: { id: true },
    });
    return { id: created.id, url: documentVerifyUrl(created.id) };
  }

  // RECEIPT : un enregistrement par paiement
  if (input.type === 'RECEIPT' && input.paymentRecordId) {
    const existing = await db.documentVerification.findFirst({
      where: { type: 'RECEIPT', paymentRecordId: input.paymentRecordId },
      select: { id: true },
    });

    if (existing) {
      await db.documentVerification.update({
        where: { id: existing.id },
        data: { metadata: metadataJson },
      });
      return { id: existing.id, url: documentVerifyUrl(existing.id) };
    }

    const created = await db.documentVerification.create({
      data: {
        type: 'RECEIPT',
        schoolId: input.schoolId,
        studentId: input.studentId ?? null,
        paymentRecordId: input.paymentRecordId,
        trimester: input.trimester ?? null,
        metadata: metadataJson,
      },
      select: { id: true },
    });
    return { id: created.id, url: documentVerifyUrl(created.id) };
  }

  // Fallback : document à usage unique
  const created = await db.documentVerification.create({
    data: {
      type: input.type,
      schoolId: input.schoolId,
      studentId: input.studentId ?? null,
      paymentRecordId: input.paymentRecordId ?? null,
      trimester: input.trimester ?? null,
      schoolYearId: input.schoolYearId ?? null,
      metadata: metadataJson,
    },
    select: { id: true },
  });
  return { id: created.id, url: documentVerifyUrl(created.id) };
}

/** Génère le QR code (data URL PNG) d'un document officiel. */
export async function qrDataUrlForDocument(code: string): Promise<string> {
  return QRCode.toDataURL(documentVerifyUrl(code), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
  });
}

/** Lit un enregistrement de vérification par son code (utilisé par la page publique). */
export async function getVerificationRecord(code: string) {
  return db.documentVerification.findUnique({
    where: { id: code },
    include: {
      school: {
        select: { name: true, shortName: true, logo: true, address: true, city: true, country: true },
      },
    },
  });
}
