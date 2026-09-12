import { NextResponse } from 'next/server';
import { EDUCATIONAL_SYSTEMS_LIST } from '@/lib/educational-systems';

/**
 * GET /api/educational-systems — PUBLIC (aucune auth)
 * Liste des systèmes éducatifs avec parcours (classes, options, horaires).
 */
export async function GET() {
  return NextResponse.json({ data: EDUCATIONAL_SYSTEMS_LIST });
}
