// ─────────────────────────────────────────────────────────────────────────────
// Educational systems v2
//  - v1 compat : ClassTemplate / EducationalSystemInfo / EDUCATIONAL_SYSTEMS /
//    EDUCATIONAL_SYSTEMS_LIST / getEducationalSystem / getDefaultClassesForSystem
//  - v2        : parcours (sections) with classes + options (filières) +
//    horaires, class generation with options, public /api/educational-systems
// ─────────────────────────────────────────────────────────────────────────────

export type EducationalSystemId = 'RDC' | 'BELGIUM' | 'FRANCE' | 'ANGLOPHONE' | 'FRANCOPHONE'

export type SectionKey = 'MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE'

export interface ClassTemplate {
  name: string
  section: SectionKey
  level: string
  capacity?: number
  /** Option/filière d'origine (ex: "Commerciale & Gestion") — classes générées avec options */
  option?: string
}

export interface OptionTemplate {
  id: string
  name: string
  shortName: string
  description: string
  /** Niveaux (levels) auxquels cette option s'applique (ex: ['3H','4H']) */
  applicableLevels: string[]
}

export type HorairePeriodType = 'COURS' | 'PAUSE' | 'DEJEUNER' | 'ACCUEIL'

export interface HorairePeriod {
  label: string
  start: string
  end: string
  type: HorairePeriodType
}

export interface SectionHoraire {
  start: string
  end: string
  days: string
  periods: HorairePeriod[]
}

export interface SectionInfo {
  section: SectionKey
  label: string
  description: string
  classes: ClassTemplate[]
  options: OptionTemplate[]
  horaire: SectionHoraire
}

interface EducationalSystemBase {
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

export interface EducationalSystemInfo extends EducationalSystemBase {
  /** Parcours (sections) avec classes, options et horaires — v2 */
  parcours: SectionInfo[]
  /** Options (filières) populaires du secondaire — v2 */
  defaultOptions: OptionTemplate[]
}

// ─── Options (filières) par système ──────────────────────────────────────────

const RDC_OPTIONS: OptionTemplate[] = [
  { id: 'COMMERCIALE', name: 'Commerciale & Gestion', shortName: 'CG', description: 'Commerce, gestion, comptabilité et vente.', applicableLevels: ['3H', '4H'] },
  { id: 'PEDAGOGIE', name: 'Pédagogie Générale', shortName: 'PG', description: 'Formation des futurs enseignants du primaire et du secondaire.', applicableLevels: ['3H', '4H'] },
  { id: 'MATH_PHYS', name: 'Math-Physique', shortName: 'MP', description: 'Sciences mathématiques et physiques, orientation scientifique et technique.', applicableLevels: ['3H', '4H'] },
  { id: 'BIO_CHIMIE', name: 'Bio-Chimie', shortName: 'BC', description: 'Biologie et chimie, orientation médicale et scientifique.', applicableLevels: ['3H', '4H'] },
  { id: 'LITTERAIRE', name: 'Littéraire (Français-Latin)', shortName: 'LT', description: 'Lettres françaises et latin, orientation juridique et littéraire.', applicableLevels: ['3H', '4H'] },
  { id: 'SECRETARIAT', name: 'Secrétariat Informatique', shortName: 'SI', description: 'Secrétariat bureautique et informatique de gestion.', applicableLevels: ['3H', '4H'] },
  { id: 'ELECTRONIQUE', name: 'Électronique', shortName: 'EL', description: 'Électronique, électricité et maintenance industrielle.', applicableLevels: ['3H', '4H'] },
]

const BELGIUM_OPTIONS: OptionTemplate[] = [
  { id: 'GENERALE', name: 'Générale', shortName: 'G', description: 'Enseignement général de transition, préparation aux études supérieures.', applicableLevels: ['S3', 'S4', 'S5', 'S6'] },
  { id: 'TECHNIQUE', name: 'Technique', shortName: 'T', description: 'Enseignement technique de transition ou de qualification.', applicableLevels: ['S3', 'S4', 'S5', 'S6'] },
  { id: 'PROFESSIONNELLE', name: 'Professionnelle', shortName: 'P', description: 'Enseignement professionnel, insertion directe sur le marché du travail.', applicableLevels: ['S3', 'S4', 'S5', 'S6'] },
  { id: 'QUALIFIANTE', name: 'Qualifiante', shortName: 'Q', description: 'Filières qualifiantes avec certificat de qualification.', applicableLevels: ['S3', 'S4', 'S5', 'S6'] },
]

const FRANCE_OPTIONS: OptionTemplate[] = [
  { id: 'GENERALE', name: 'Générale', shortName: 'G', description: 'Voie générale du lycée, préparation au baccalauréat général.', applicableLevels: ['1ERE', 'TLE'] },
  { id: 'TECHNOLOGIQUE', name: 'Technologique', shortName: 'T', description: 'Voie technologique du lycée, baccalauréat technologique.', applicableLevels: ['1ERE', 'TLE'] },
  { id: 'PROFESSIONNELLE', name: 'Professionnelle', shortName: 'P', description: 'Baccalauréat professionnel, insertion ou poursuite d\'études.', applicableLevels: ['1ERE', 'TLE'] },
]

const ANGLOPHONE_OPTIONS: OptionTemplate[] = [
  { id: 'SCIENCE', name: 'Science', shortName: 'SCI', description: 'Science subjects (Mathematics, Physics, Chemistry, Biology).', applicableLevels: ['F3', 'F4', 'F5'] },
  { id: 'ARTS', name: 'Arts', shortName: 'ARTS', description: 'Arts and humanities subjects (Literature, History, Geography).', applicableLevels: ['F3', 'F4', 'F5'] },
  { id: 'COMMERCE', name: 'Commerce', shortName: 'COM', description: 'Commercial subjects (Economics, Accounting, Commerce).', applicableLevels: ['F3', 'F4', 'F5'] },
]

const FRANCOPHONE_OPTIONS: OptionTemplate[] = [
  { id: 'A4', name: 'A4 (Lettres)', shortName: 'A4', description: 'Série A4 : lettres, langues et sciences humaines.', applicableLevels: ['1ERE', 'TLE'] },
  { id: 'C4', name: 'C4 (Maths)', shortName: 'C4', description: 'Série C4 : mathématiques et sciences physiques.', applicableLevels: ['1ERE', 'TLE'] },
  { id: 'D4', name: 'D4 (Sciences)', shortName: 'D4', description: 'Série D4 : sciences expérimentales, orientation médicale.', applicableLevels: ['1ERE', 'TLE'] },
]

const SYSTEM_OPTIONS: Record<EducationalSystemId, OptionTemplate[]> = {
  RDC: RDC_OPTIONS,
  BELGIUM: BELGIUM_OPTIONS,
  FRANCE: FRANCE_OPTIONS,
  ANGLOPHONE: ANGLOPHONE_OPTIONS,
  FRANCOPHONE: FRANCOPHONE_OPTIONS,
}

// ─── Horaires réalistes par système et section ───────────────────────────────

const RDC_HORAIRES: Record<SectionKey, SectionHoraire> = {
  MATERNELLE: {
    start: '08:00', end: '12:00', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Accueil', start: '07:45', end: '08:00', type: 'ACCUEIL' },
      { label: 'Cours', start: '08:00', end: '10:00', type: 'COURS' },
      { label: 'Récréation', start: '10:00', end: '10:30', type: 'PAUSE' },
      { label: 'Cours', start: '10:30', end: '12:00', type: 'COURS' },
    ],
  },
  PRIMAIRE: {
    start: '07:30', end: '12:30', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '07:30', end: '09:30', type: 'COURS' },
      { label: 'Récréation', start: '09:30', end: '10:00', type: 'PAUSE' },
      { label: 'Cours', start: '10:00', end: '12:30', type: 'COURS' },
    ],
  },
  SECONDAIRE: {
    start: '07:30', end: '15:30', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '07:30', end: '09:30', type: 'COURS' },
      { label: 'Récréation', start: '09:30', end: '10:00', type: 'PAUSE' },
      { label: 'Cours', start: '10:00', end: '12:30', type: 'COURS' },
      { label: 'Déjeuner', start: '12:30', end: '13:30', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:30', end: '15:30', type: 'COURS' },
    ],
  },
}

const BELGIUM_HORAIRES: Record<SectionKey, SectionHoraire> = {
  MATERNELLE: {
    start: '08:30', end: '15:30', days: 'Lundi - Vendredi (mercredi après-midi libre)',
    periods: [
      { label: 'Cours', start: '08:30', end: '10:15', type: 'COURS' },
      { label: 'Récréation', start: '10:15', end: '10:45', type: 'PAUSE' },
      { label: 'Cours', start: '10:45', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:15', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:15', end: '15:30', type: 'COURS' },
    ],
  },
  PRIMAIRE: {
    start: '08:30', end: '15:30', days: 'Lundi - Vendredi (mercredi après-midi libre)',
    periods: [
      { label: 'Cours', start: '08:30', end: '10:15', type: 'COURS' },
      { label: 'Récréation', start: '10:15', end: '10:45', type: 'PAUSE' },
      { label: 'Cours', start: '10:45', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:15', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:15', end: '15:30', type: 'COURS' },
    ],
  },
  SECONDAIRE: {
    start: '08:15', end: '16:20', days: 'Lundi - Vendredi (mercredi après-midi libre)',
    periods: [
      { label: 'Cours', start: '08:15', end: '10:10', type: 'COURS' },
      { label: 'Récréation', start: '10:10', end: '10:25', type: 'PAUSE' },
      { label: 'Cours', start: '10:25', end: '12:10', type: 'COURS' },
      { label: 'Déjeuner', start: '12:10', end: '13:10', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:10', end: '16:20', type: 'COURS' },
    ],
  },
}

const FRANCE_HORAIRES: Record<SectionKey, SectionHoraire> = {
  MATERNELLE: {
    start: '08:30', end: '16:30', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '08:30', end: '10:00', type: 'COURS' },
      { label: 'Récréation', start: '10:00', end: '10:30', type: 'PAUSE' },
      { label: 'Cours', start: '10:30', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:30', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:30', end: '16:30', type: 'COURS' },
    ],
  },
  PRIMAIRE: {
    start: '08:30', end: '15:30', days: 'Lundi, Mardi, Jeudi, Vendredi',
    periods: [
      { label: 'Cours', start: '08:30', end: '10:00', type: 'COURS' },
      { label: 'Récréation', start: '10:00', end: '10:15', type: 'PAUSE' },
      { label: 'Cours', start: '10:15', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:30', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:30', end: '15:30', type: 'COURS' },
    ],
  },
  SECONDAIRE: {
    start: '08:00', end: '17:00', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '08:00', end: '09:55', type: 'COURS' },
      { label: 'Récréation', start: '09:55', end: '10:10', type: 'PAUSE' },
      { label: 'Cours', start: '10:10', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:30', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:30', end: '17:00', type: 'COURS' },
    ],
  },
}

const ANGLOPHONE_HORAIRES: Record<SectionKey, SectionHoraire> = {
  MATERNELLE: {
    start: '07:30', end: '12:00', days: 'Monday - Friday',
    periods: [
      { label: 'Lessons', start: '07:30', end: '10:00', type: 'COURS' },
      { label: 'Break', start: '10:00', end: '10:30', type: 'PAUSE' },
      { label: 'Lessons', start: '10:30', end: '12:00', type: 'COURS' },
    ],
  },
  PRIMAIRE: {
    start: '07:30', end: '13:00', days: 'Monday - Friday',
    periods: [
      { label: 'Lessons', start: '07:30', end: '10:00', type: 'COURS' },
      { label: 'Break', start: '10:00', end: '10:30', type: 'PAUSE' },
      { label: 'Lessons', start: '10:30', end: '13:00', type: 'COURS' },
    ],
  },
  SECONDAIRE: {
    start: '07:30', end: '15:00', days: 'Monday - Friday',
    periods: [
      { label: 'Lessons', start: '07:30', end: '09:50', type: 'COURS' },
      { label: 'Break', start: '09:50', end: '10:10', type: 'PAUSE' },
      { label: 'Lessons', start: '10:10', end: '12:00', type: 'COURS' },
      { label: 'Lunch', start: '12:00', end: '13:00', type: 'DEJEUNER' },
      { label: 'Lessons', start: '13:00', end: '15:00', type: 'COURS' },
    ],
  },
}

const FRANCOPHONE_HORAIRES: Record<SectionKey, SectionHoraire> = {
  MATERNELLE: {
    start: '07:30', end: '12:00', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '07:30', end: '09:45', type: 'COURS' },
      { label: 'Récréation', start: '09:45', end: '10:15', type: 'PAUSE' },
      { label: 'Cours', start: '10:15', end: '12:00', type: 'COURS' },
    ],
  },
  PRIMAIRE: {
    start: '07:30', end: '12:30', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '07:30', end: '09:45', type: 'COURS' },
      { label: 'Récréation', start: '09:45', end: '10:15', type: 'PAUSE' },
      { label: 'Cours', start: '10:15', end: '12:30', type: 'COURS' },
    ],
  },
  SECONDAIRE: {
    start: '07:30', end: '15:00', days: 'Lundi - Vendredi',
    periods: [
      { label: 'Cours', start: '07:30', end: '09:45', type: 'COURS' },
      { label: 'Récréation', start: '09:45', end: '10:15', type: 'PAUSE' },
      { label: 'Cours', start: '10:15', end: '12:00', type: 'COURS' },
      { label: 'Déjeuner', start: '12:00', end: '13:00', type: 'DEJEUNER' },
      { label: 'Cours', start: '13:00', end: '15:00', type: 'COURS' },
    ],
  },
}

const SYSTEM_HORAIRES: Record<EducationalSystemId, Record<SectionKey, SectionHoraire>> = {
  RDC: RDC_HORAIRES,
  BELGIUM: BELGIUM_HORAIRES,
  FRANCE: FRANCE_HORAIRES,
  ANGLOPHONE: ANGLOPHONE_HORAIRES,
  FRANCOPHONE: FRANCOPHONE_HORAIRES,
}

// ─── Libellés et descriptions des sections par système ───────────────────────

const SECTION_META: Record<EducationalSystemId, Record<SectionKey, { label: string; description: string }>> = {
  RDC: {
    MATERNELLE: { label: 'Maternelle', description: 'Éveil et préparation scolaire (1ère, 2ème, 3ème Maternelle).' },
    PRIMAIRE: { label: 'Primaire', description: 'Enseignement primaire de la 1ère à la 6ème année.' },
    SECONDAIRE: { label: 'Humanités', description: '7e & 8e Éducation de Base puis 1ère à 4ème Humanités avec options.' },
  },
  BELGIUM: {
    MATERNELLE: { label: 'Maternel', description: 'Enseignement maternel (Accueil, M1-M3).' },
    PRIMAIRE: { label: 'Primaire', description: 'Enseignement primaire P1 à P6.' },
    SECONDAIRE: { label: 'Secondaire', description: 'Enseignement secondaire S1 à S6 avec filières générale, technique, professionnelle et qualifiante.' },
  },
  FRANCE: {
    MATERNELLE: { label: 'Maternelle', description: 'Petite, Moyenne et Grande Section.' },
    PRIMAIRE: { label: 'Élémentaire', description: 'CP, CE1, CE2, CM1, CM2.' },
    SECONDAIRE: { label: 'Collège & Lycée', description: '6ème à 3ème au collège, 2nde à Terminale au lycée (voies générale, technologique et professionnelle).' },
  },
  ANGLOPHONE: {
    MATERNELLE: { label: 'Nursery', description: 'Nursery 1 & 2 — early childhood education.' },
    PRIMAIRE: { label: 'Primary', description: 'Primary Classes 1 to 6.' },
    SECONDAIRE: { label: 'Secondary', description: 'Form 1 to Form 5 with Science, Arts and Commerce departments, then Lower/Upper Sixth.' },
  },
  FRANCOPHONE: {
    MATERNELLE: { label: 'Maternelle', description: 'Petite, Moyenne et Grande Section.' },
    PRIMAIRE: { label: 'Primaire', description: 'SIL, CP, CE1, CE2, CM1, CM2.' },
    SECONDAIRE: { label: 'Secondaire', description: '6ème à Terminale avec séries A4 (Lettres), C4 (Maths) et D4 (Sciences).' },
  },
}

// ─── Systèmes éducatifs (classes par défaut — compat v1) ─────────────────────

const SYSTEMS_BASE: Record<EducationalSystemId, EducationalSystemBase> = {
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

// ─── Construction des parcours (v2) ─────────────────────────────────────────

function buildParcours(base: EducationalSystemBase, options: OptionTemplate[]): SectionInfo[] {
  const horaires = SYSTEM_HORAIRES[base.id]
  const meta = SECTION_META[base.id]
  const hasMaternelle = Boolean(base.sections.maternelle)
  const order: SectionKey[] = hasMaternelle
    ? ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']
    : ['PRIMAIRE', 'SECONDAIRE']

  const parcours: SectionInfo[] = []
  for (const section of order) {
    const info = meta[section]
    if (!info) continue
    const classes = base.defaultClasses.filter(c => c.section === section)
    parcours.push({
      section,
      label: info.label,
      description: info.description,
      classes,
      options: section === 'SECONDAIRE' ? options : [],
      horaire: horaires[section],
    })
  }
  return parcours
}

function withParcours(base: EducationalSystemBase): EducationalSystemInfo {
  const options = SYSTEM_OPTIONS[base.id] || []
  return {
    ...base,
    parcours: buildParcours(base, options),
    defaultOptions: options,
  }
}

export const EDUCATIONAL_SYSTEMS: Record<EducationalSystemId, EducationalSystemInfo> = {
  RDC: withParcours(SYSTEMS_BASE.RDC),
  BELGIUM: withParcours(SYSTEMS_BASE.BELGIUM),
  FRANCE: withParcours(SYSTEMS_BASE.FRANCE),
  ANGLOPHONE: withParcours(SYSTEMS_BASE.ANGLOPHONE),
  FRANCOPHONE: withParcours(SYSTEMS_BASE.FRANCOPHONE),
}

export const EDUCATIONAL_SYSTEMS_LIST: EducationalSystemInfo[] = Object.values(EDUCATIONAL_SYSTEMS)

export function getEducationalSystem(id?: string | null): EducationalSystemInfo {
  if (!id) return EDUCATIONAL_SYSTEMS.RDC
  const upper = id.toUpperCase() as EducationalSystemId
  return EDUCATIONAL_SYSTEMS[upper] || EDUCATIONAL_SYSTEMS.RDC
}

/**
 * Classes par défaut (compat v1) = classes de base aplaties (sans options).
 */
export function getDefaultClassesForSystem(systemId?: string | null): ClassTemplate[] {
  return getEducationalSystem(systemId).defaultClasses
}

/**
 * Parcours (sections) d'un système éducatif — v2.
 */
export function getParcoursForSystem(systemId?: string | null): SectionInfo[] {
  return getEducationalSystem(systemId).parcours
}

const SECTION_FILTERS: Record<string, SectionKey[]> = {
  MATERNELLE: ['MATERNELLE'],
  PRIMAIRE: ['PRIMAIRE'],
  SECONDAIRE: ['SECONDAIRE'],
}

const ALL_SECTIONS: SectionKey[] = ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']

/**
 * Génère les classes d'une école selon le système éducatif et son niveau.
 *
 * @param systemId      Système éducatif (RDC, BELGIUM, FRANCE, ANGLOPHONE, FRANCOPHONE)
 * @param schoolLevel   Niveau de l'école ('MATERNELLE' | 'PRIMAIRE' | 'SECONDAIRE' | 'POLYVALENTE' | null)
 * @param includeOptions Si true (défaut), génère aussi UNE classe par option applicable
 *                      au niveau de la classe de base (ex: "3ème Humanités Commerciale & Gestion")
 */
export function getClassesForSystem(
  systemId: string | null | undefined,
  schoolLevel?: string | null,
  includeOptions: boolean = true
): ClassTemplate[] {
  const wanted = schoolLevel ? SECTION_FILTERS[schoolLevel.toUpperCase()] : undefined
  const sections = wanted || ALL_SECTIONS
  const parcours = getParcoursForSystem(systemId)

  const templates: ClassTemplate[] = []
  for (const p of parcours) {
    if (!sections.includes(p.section)) continue
    for (const cls of p.classes) {
      templates.push(cls)
      if (includeOptions) {
        for (const option of p.options) {
          if (option.applicableLevels.includes(cls.level)) {
            templates.push({
              ...cls,
              name: `${cls.name} ${option.name}`,
              option: option.name,
            })
          }
        }
      }
    }
  }
  return templates
}
