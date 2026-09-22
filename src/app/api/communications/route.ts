import { db } from '@/lib/db';
import { notifyEvent } from '@/lib/notification-service';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError, requireActiveSubscription } from '@/lib/auth';
import { requireFeature } from '@/lib/feature-gate';
import { notifyCommunication, isWhatsAppConnected } from '@/lib/whatsapp-agent';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'communications:read');
    if ('error' in authResult) return authResult.error;
    // Feature communications réservée STANDARD+ côté serveur (avant : API
    // accessible aux écoles FREEMIUM alors que l'UI la masque).
    const featureCheck = await requireFeature(request, 'communications');
    if ('error' in featureCheck) return featureCheck.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    let schoolId = searchParams.get('schoolId') || '';
    if (!schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    const type = searchParams.get('type') || '';
    const mine = searchParams.get('mine') === 'true';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (type) where.type = type;
    if (mine) where.senderId = user.id;

    // Filter by status - non-admin only see APPROVED
    // SCHOOL_ADMIN (admin de l'école) voit les PENDING de SON école : c'est lui
    // l'approbateur (avec le super admin plateforme). Le rôle 'ADMIN' historique
    // n'existe pas mais reste dans la condition par précaution.
    if (user.role === 'SECRETARY') {
      // Le secrétaire voit les communications approuvées + SES PROPRES demandes
      // (suivi « en attente / approuvée / rejetée » de sa demande de permission).
      where.OR = [{ status: 'APPROVED' }, { senderId: user.id }];
    } else if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.role !== 'SCHOOL_ADMIN' && user.role !== 'ADMIN') {
      where.status = 'APPROVED';
    }

    // Filter by scope - directions only see their domain
    if (user.role === 'DIRECTION_MATERNELLE') {
      where.OR = [{ scope: null }, { scope: 'MATERNELLE' }];
    } else if (user.role === 'DIRECTION_PRIMAIRE') {
      where.OR = [{ scope: null }, { scope: 'PRIMAIRE' }];
    } else if (user.role === 'DIRECTION_SECONDAIRE') {
      where.OR = [{ scope: null }, { scope: 'SECONDAIRE' }];
    }

    // Filter by targetType - teachers see ALL+STAFF, parents see ALL+PARENTS
    if (user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') {
      where.targetType = { in: ['ALL', 'STAFF'] };
    } else if (user.role === 'PARENT') {
      where.targetType = { in: ['ALL', 'PARENTS'] };
    }

    const [communications, total, totalUsers] = await Promise.all([
      db.communication.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          reads: {
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { readAt: 'desc' },
          },
        },
      }),
      db.communication.count({ where }),
      db.user.count({ where: { schoolId, isActive: true } }),
    ]);

    return NextResponse.json({
      data: communications,
      totalUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing communications:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const subCheck = await requireActiveSubscription(request);
    if ('error' in subCheck) return subCheck.error;

    const authResult = await requirePermission(request, 'communications:create');
    if ('error' in authResult) return authResult.error;
    // Feature communications réservée STANDARD+ côté serveur.
    const featureCheck = await requireFeature(request, 'communications');
    if ('error' in featureCheck) return featureCheck.error;
    const { user } = authResult;

    const body = await request.json();
    const {
      schoolId,
      type,
      title,
      content,
      targetType,
      targetId,
      sentToApp,
      sentToWhatsapp,
    } = body;

    if (!schoolId || !type || !title || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, type, title, content' },
        { status: 400 }
      );
    }

    // Sécurité (SEC-1/F5) : plafonds de longueur (avant : 10 000+ caractères
    // acceptés et stockés tels quels — gonflement DB/WhatsApp sans crash).
    if (typeof title !== 'string' || typeof content !== 'string' || title.trim().length > 200 || content.trim().length > 5000) {
      return NextResponse.json(
        { error: 'Titre limité à 200 caractères, contenu à 5 000.' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // CRITICAL: Derive senderId and senderRole from the authenticated user, NOT from request body
    // This prevents identity spoofing
    const senderId = user.id;
    const senderRole = user.role;

    // Determine scope from sender role
    // Demande de permission : DIRECTION_* (déjà) ET SECRÉTAIRE créent des
    // communications PENDING — l'envoi réel part APRÈS approbation par
    // l'admin de l'école (SCHOOL_ADMIN) ou le super admin plateforme.
    let scope: string | null = null;
    let status = 'APPROVED';
    if (user.role === 'DIRECTION_MATERNELLE') {
      scope = 'MATERNELLE';
      status = 'PENDING';
    } else if (user.role === 'DIRECTION_PRIMAIRE') {
      scope = 'PRIMAIRE';
      status = 'PENDING';
    } else if (user.role === 'DIRECTION_SECONDAIRE') {
      scope = 'SECONDAIRE';
      status = 'PENDING';
    } else if (user.role === 'SECRETARY') {
      status = 'PENDING';
    }

    const communication = await db.communication.create({
      data: {
        senderId,
        senderRole,
        schoolId,
        type,
        title,
        content,
        targetType: targetType || 'ALL',
        targetId: targetId || null,
        sentToApp: sentToApp !== undefined ? sentToApp : true,
        sentToWhatsapp: sentToWhatsapp !== undefined ? sentToWhatsapp : true,
        status,
        scope,
      },
    });

    // Notify approvers if pending — roles RÉELS uniquement (le rôle 'ADMIN'
    // historique n'existe pas : les demandes n'étaient jamais notifiées).
    // Le resolver cible SCHOOL_ADMIN de l'école + super admin plateforme
    // (autorisés à approuver via communications:create) et exclut l'auteur.
    if (status === 'PENDING') {
      await notifyEvent(
        { type: 'COMMUNICATION_PENDING', schoolId, actorId: user.id },
        {
          title: 'Communication en attente',
          message: `${user.name} a créé une communication "${title}" qui nécessite votre approbation.`,
        }
      );
    }

    // ── Diffusion WhatsApp RÉELLE via l'agent de l'école ──────────────────
    // Vérité d'abord : si WhatsApp est demandé mais l'agent est hors ligne,
    // on le signale explicitement au lieu d'un faux succès.
    let whatsappWarning: string | null = null;
    let whatsappStarted = false;
    if (communication.sentToWhatsapp && communication.status === 'APPROVED') {
      let waUp = false;
      try {
        waUp = await Promise.race([
          isWhatsAppConnected(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
        ]);
      } catch {
        waUp = false;
      }
      if (!waUp) {
        whatsappWarning =
          "Agent WhatsApp non connecté — message enregistré dans l'app, diffusion WhatsApp en attente. Connectez l'agent puis renvoyez.";
      } else {
        whatsappStarted = true;
      }
    }

    // Exécutée en arrière-plan (les envois sont espacés d'1,2s anti-ban) :
    // la réponse HTTP reste rapide, les messages partent réellement.
    if (whatsappStarted) {
      void (async () => {
        try {
          const school = await db.school.findUnique({
            where: { id: schoolId },
            select: { name: true },
          });
          await notifyCommunication({
            schoolId,
            schoolName: school?.name || '',
            title: communication.title,
            content: communication.content,
            type: communication.type,
            targetType: communication.targetType,
            targetId: communication.targetId,
            scope: communication.scope,
          });
        } catch (e) {
          console.error('[Communications] Diffusion WhatsApp échouée:', e);
        }
      })();
    }

    return NextResponse.json(
      { data: communication, warning: whatsappWarning },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating communication:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
