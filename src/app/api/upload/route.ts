import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const userId = formData.get('userId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Le fichier doit être une image' }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "L'image ne doit pas dépasser 5MB" }, { status: 400 });
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    // Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create upload directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
    await mkdir(uploadDir, { recursive: true });

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${userId}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadDir, filename);

    // Write file to disk
    await writeFile(filepath, buffer);

    // Build the public URL
    const profileImageUrl = `/uploads/profiles/${filename}`;

    // Update user in database
    await db.user.update({
      where: { id: userId },
      data: { profileImageUrl },
    });

    return NextResponse.json({
      success: true,
      profileImageUrl,
      message: 'Photo de profil mise à jour',
    });
  } catch (error) {
    console.error('Error uploading profile photo:', error);
    return NextResponse.json(
      { error: "Erreur lors du téléchargement de l'image" },
      { status: 500 }
    );
  }
}
