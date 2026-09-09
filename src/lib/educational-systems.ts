export type EducationalSystemId = 'RDC' | 'BELGIUM' | 'FRANCE' | 'ANGLOPHONE' | 'FRANCOPHONE'

export interface ClassTemplate {
  name: string
  section: 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE'
  level: string
  capacity?: number
}

export interface EducationalSystemInfo {
  id: EducationalSystemId
  name: string
  shortLabel: string
  flag: string
  countryCode: string
  country: string
  description: string
  sampleClasses: string
  sections: {
    maternelle?: string
    primaire: string
    secondaire: string
  }
  defaultClasses: ClassTemplate[]
}

export const EDUCATIONAL_SYSTEMS: Record<EducationalSystemId, EducationalSystemInfo> = {
  RDC: {
    id: 'RDC',
    name: 'République Démocratique du Congo (RDC)',
    shortLabel: 'RDC',
    flag: '🇨🇩',
    countryCode: 'CD',
    country: 'RD Congo',
    description: 'Système national congolais : Maternelle, Primaire (1ère-6ème) et Humanités secondaires.',
    sampleClasses: '1ère Primaire à 6ème Primaire, 7e & 8e Éducation de base, 1ère à 4ème Humanités',
    sections: {
      maternelle: 'Maternelle (1ère, 2ème, 3ème)',
      primaire: 'Primaire (1ère à 6ème)',
      secondaire: 'Éducation de Base & Humanités',
    },
    defaultClasses: [
      // Maternelle
      { name: '1ère Maternelle', section: 'MATERNELLE', level: '1M', capacity: 30 },
      { name: '2ème Maternelle', section: 'MATERNELLE', level: '2M', capacity: 30 },
      { name: '3ème Maternelle', section: 'MATERNELLE', level: '3M', capacity: 30 },
      // Primaire
      { name: '1ère Primaire', section: 'PRIMAIRE', level: '1P', capacity: 40 },
      { name: '2ème Primaire', section: 'PRIMAIRE', level: '2P', capacity: 40 },
      { name: '3ème Primaire', section: 'PRIMAIRE', level: '3P', capacity: 40 },
      { name: '4ème Primaire', section: 'PRIMAIRE', level: '4P', capacity: 40 },
      { name: '5ème Primaire', section: 'PRIMAIRE', level: '5P', capacity: 40 },
      { name: '6ème Primaire', section: 'PRIMAIRE', level: '6P', capacity: 40 },
      // Secondaire / Éducation de Base
      { name: '7ème Éducation de Base', section: 'SECONDAIRE', level: '7EB', capacity: 45 },
      { name: '8ème Éducation de Base', section: 'SECONDAIRE', level: '8EB', capacity: 45 },
      { name: '1ère Humanités', section: 'SECONDAIRE', level: '1H', capacity: 45 },
      { name: '2ème Humanités', section: 'SECONDAIRE', level: '2H', capacity: 45 },
      { name: '3ème Humanités', section: 'SECONDAIRE', level: '3H', capacity: 45 },
      { name: '4ème Humanités', section: 'SECONDAIRE', level: '4H', capacity: 45 },
    ],
  },
  BELGIUM: {
    id: 'BELGIUM',
    name: 'Belgique',
    shortLabel: 'Belgique',
    flag: '🇧🇪',
    countryCode: 'BE',
    country: 'Belgique',
    description: 'Système éducatif belge : Fondamental maternel, Primaire P1-P6 et Secondaire S1-S6.',
    sampleClasses: 'P1 à P6 (1ère à 6ème primaire), S1 à S6 (1ère à 6ème secondaire)',
    sections: {
      maternelle: 'Maternel (Accueil, M1-M3)',
      primaire: 'Primaire (P1 à P6)',
      secondaire: 'Secondaire (S1 à S6)',
    },
    defaultClasses: [
      // Maternel
      { name: 'Classe d\'Accueil', section: 'MATERNELLE', level: 'ACC', capacity: 25 },
      { name: '1ère Maternelle (M1)', section: 'MATERNELLE', level: 'M1', capacity: 25 },
      { name: '2ème Maternelle (M2)', section: 'MATERNELLE', level: 'M2', capacity: 25 },
      { name: '3ème Maternelle (M3)', section: 'MATERNELLE', level: 'M3', capacity: 25 },
      // Primaire
      { name: '1ère Primaire (P1)', section: 'PRIMAIRE', level: 'P1', capacity: 35 },
      { name: '2ème Primaire (P2)', section: 'PRIMAIRE', level: 'P2', capacity: 35 },
      { name: '3ème Primaire (P3)', section: 'PRIMAIRE', level: 'P3', capacity: 35 },
      { name: '4ème Primaire (P4)', section: 'PRIMAIRE', level: 'P4', capacity: 35 },
      { name: '5ème Primaire (P5)', section: 'PRIMAIRE', level: 'P5', capacity: 35 },
      { name: '6ème Primaire (P6)', section: 'PRIMAIRE', level: 'P6', capacity: 35 },
      // Secondaire
      { name: '1ère Secondaire (S1)', section: 'SECONDAIRE', level: 'S1', capacity: 35 },
      { name: '2ème Secondaire (S2)', section: 'SECONDAIRE', level: 'S2', capacity: 35 },
      { name: '3ème Secondaire (S3)', section: 'SECONDAIRE', level: 'S3', capacity: 35 },
      { name: '4ème Secondaire (S4)', section: 'SECONDAIRE', level: 'S4', capacity: 35 },
      { name: '5ème Secondaire (S5)', section: 'SECONDAIRE', level: 'S5', capacity: 35 },
      { name: '6ème Secondaire (S6)', section: 'SECONDAIRE', level: 'S6', capacity: 35 },
    ],
  },
  FRANCE: {
    id: 'FRANCE',
    name: 'France',
    shortLabel: 'France',
    flag: '🇫🇷',
    countryCode: 'FR',
    country: 'France',
    description: 'Système éducatif français : Maternelle, Élémentaire (CP, CE1, CE2, CM1, CM2), Collège et Lycée.',
    sampleClasses: 'CP, CE1, CE2, CM1, CM2, 6ème, 5ème, 4ème, 3ème, 2nde, 1ère, Terminale',
    sections: {
      maternelle: 'Maternelle (PS, MS, GS)',
      primaire: 'Élémentaire (CP, CE1, CE2, CM1, CM2)',
      secondaire: 'Collège & Lycée (6ème à Terminale)',
    },
    defaultClasses: [
      // Maternelle
      { name: 'Petite Section (PS)', section: 'MATERNELLE', level: 'PS', capacity: 25 },
      { name: 'Moyenne Section (MS)', section: 'MATERNELLE', level: 'MS', capacity: 25 },
      { name: 'Grande Section (GS)', section: 'MATERNELLE', level: 'GS', capacity: 25 },
      // Élémentaire
      { name: 'CP', section: 'PRIMAIRE', level: 'CP', capacity: 35 },
      { name: 'CE1', section: 'PRIMAIRE', level: 'CE1', capacity: 35 },
      { name: 'CE2', section: 'PRIMAIRE', level: 'CE2', capacity: 35 },
      { name: 'CM1', section: 'PRIMAIRE', level: 'CM1', capacity: 35 },
      { name: 'CM2', section: 'PRIMAIRE', level: 'CM2', capacity: 35 },
      // Collège
      { name: '6ème', section: 'SECONDAIRE', level: '6EME', capacity: 35 },
      { name: '5ème', section: 'SECONDAIRE', level: '5EME', capacity: 35 },
      { name: '4ème', section: 'SECONDAIRE', level: '4EME', capacity: 35 },
      { name: '3ème', section: 'SECONDAIRE', level: '3EME', capacity: 35 },
      // Lycée
      { name: '2nde', section: 'SECONDAIRE', level: '2NDE', capacity: 35 },
      { name: '1ère', section: 'SECONDAIRE', level: '1ERE', capacity: 35 },
      { name: 'Terminale', section: 'SECONDAIRE', level: 'TLE', capacity: 35 },
    ],
  },
  ANGLOPHONE: {
    id: 'ANGLOPHONE',
    name: 'Sous-système anglophone',
    shortLabel: 'Anglophone',
    flag: '🇬🇧',
    countryCode: 'GB',
    country: 'International / Anglophone',
    description: 'Système éducatif anglophone (Cambridge / Commonwealth) : Nursery, Primary (Class 1-6), Secondary (Form 1-5, Sixth Form).',
    sampleClasses: 'Class 1-6, Form 1-5, Lower Sixth, Upper Sixth',
    sections: {
      maternelle: 'Nursery (Nursery 1-2)',
      primaire: 'Primary (Class 1-6)',
      secondaire: 'Secondary (Form 1-5, Lower/Upper Sixth)',
    },
    defaultClasses: [
      // Nursery
      { name: 'Nursery 1', section: 'MATERNELLE', level: 'N1', capacity: 25 },
      { name: 'Nursery 2', section: 'MATERNELLE', level: 'N2', capacity: 25 },
      // Primary
      { name: 'Class 1', section: 'PRIMAIRE', level: 'C1', capacity: 35 },
      { name: 'Class 2', section: 'PRIMAIRE', level: 'C2', capacity: 35 },
      { name: 'Class 3', section: 'PRIMAIRE', level: 'C3', capacity: 35 },
      { name: 'Class 4', section: 'PRIMAIRE', level: 'C4', capacity: 35 },
      { name: 'Class 5', section: 'PRIMAIRE', level: 'C5', capacity: 35 },
      { name: 'Class 6', section: 'PRIMAIRE', level: 'C6', capacity: 35 },
      // Secondary
      { name: 'Form 1', section: 'SECONDAIRE', level: 'F1', capacity: 40 },
      { name: 'Form 2', section: 'SECONDAIRE', level: 'F2', capacity: 40 },
      { name: 'Form 3', section: 'SECONDAIRE', level: 'F3', capacity: 40 },
      { name: 'Form 4', section: 'SECONDAIRE', level: 'F4', capacity: 40 },
      { name: 'Form 5', section: 'SECONDAIRE', level: 'F5', capacity: 40 },
      { name: 'Lower Sixth', section: 'SECONDAIRE', level: 'L6', capacity: 35 },
      { name: 'Upper Sixth', section: 'SECONDAIRE', level: 'U6', capacity: 35 },
    ],
  },
  FRANCOPHONE: {
    id: 'FRANCOPHONE',
    name: 'Sous-système francophone',
    shortLabel: 'Francophone',
    flag: '🇫🇷',
    countryCode: 'FR',
    country: 'Afrique Francophone',
    description: 'Système éducatif francophone (Cameroun, Afrique Centrale/Ouest) : Maternelle, SIL, CP, CE1, CE2, CM1, CM2 et Secondaire 6ème-Terminale.',
    sampleClasses: 'SIL, CP, CE1, CE2, CM1, CM2, 6ème, 5ème, 4ème, 3ème, 2nde, 1ère, Terminale',
    sections: {
      maternelle: 'Maternelle (Petite, Moyenne, Grande Section)',
      primaire: 'Primaire (SIL, CP, CE1, CE2, CM1, CM2)',
      secondaire: 'Secondaire (6ème à Terminale)',
    },
    defaultClasses: [
      // Maternelle
      { name: 'Petite Section', section: 'MATERNELLE', level: 'PS', capacity: 25 },
      { name: 'Moyenne Section', section: 'MATERNELLE', level: 'MS', capacity: 25 },
      { name: 'Grande Section', section: 'MATERNELLE', level: 'GS', capacity: 25 },
      // Primaire
      { name: 'SIL', section: 'PRIMAIRE', level: 'SIL', capacity: 40 },
      { name: 'CP', section: 'PRIMAIRE', level: 'CP', capacity: 40 },
      { name: 'CE1', section: 'PRIMAIRE', level: 'CE1', capacity: 40 },
      { name: 'CE2', section: 'PRIMAIRE', level: 'CE2', capacity: 40 },
      { name: 'CM1', section: 'PRIMAIRE', level: 'CM1', capacity: 40 },
      { name: 'CM2', section: 'PRIMAIRE', level: 'CM2', capacity: 40 },
      // Secondaire
      { name: '6ème', section: 'SECONDAIRE', level: '6EME', capacity: 45 },
      { name: '5ème', section: 'SECONDAIRE', level: '5EME', capacity: 45 },
      { name: '4ème', section: 'SECONDAIRE', level: '4EME', capacity: 45 },
      { name: '3ème', section: 'SECONDAIRE', level: '3EME', capacity: 45 },
      { name: '2nde', section: 'SECONDAIRE', level: '2NDE', capacity: 45 },
      { name: '1ère', section: 'SECONDAIRE', level: '1ERE', capacity: 45 },
      { name: 'Terminale', section: 'SECONDAIRE', level: 'TLE', capacity: 45 },
    ],
  },
}

export const EDUCATIONAL_SYSTEMS_LIST: EducationalSystemInfo[] = Object.values(EDUCATIONAL_SYSTEMS)

export function getEducationalSystem(id?: string | null): EducationalSystemInfo {
  if (!id) return EDUCATIONAL_SYSTEMS.RDC
  const upper = id.toUpperCase() as EducationalSystemId
  return EDUCATIONAL_SYSTEMS[upper] || EDUCATIONAL_SYSTEMS.RDC
}

export function getDefaultClassesForSystem(systemId?: string | null): ClassTemplate[] {
  return getEducationalSystem(systemId).defaultClasses
}
