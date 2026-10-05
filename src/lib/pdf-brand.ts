import fs from 'fs';
import path from 'path';

export function getEduGestLogoBuffer(): Buffer | null {
  try {
    const candidates = [
      path.join(process.cwd(), 'public', 'edugest-logo-pdf.jpg'),
      path.join(process.cwd(), 'public', 'edugest-logo.png'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchSchoolLogoBuffer(logo: string | null): Promise<Buffer | null> {
  if (!logo) return null;
  try {
    const url = logo.startsWith('http')
      ? logo
      : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${logo}`;
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
  return null;
}
