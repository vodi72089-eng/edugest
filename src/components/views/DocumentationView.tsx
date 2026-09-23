'use client'

import { useMemo, useState } from 'react'
import { GOLD, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS, DANGER, WARNING } from '@/lib/constants'
import {
  BookOpen, Search, Rocket, Building2, ArrowRightLeft, ShieldAlert, CreditCard,
  Mail, LifeBuoy, type LucideIcon,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTATION PRODUIT IN-APP — contenu statique (aucun appel API).
// Sommaire cliquable + recherche locale + cartes par section.
// ═══════════════════════════════════════════════════════════════════════════

type NoteTone = 'gold' | 'success' | 'danger' | 'warning'

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; tone: NoteTone; text: string }

interface DocSection {
  id: string
  title: string
  icon: LucideIcon
  summary: string
  keywords: string[]
  blocks: Block[]
}

const SECTIONS: DocSection[] = [
  {
    id: 'demarrer',
    title: 'Démarrer',
    icon: Rocket,
    summary: 'Créer une école, inviter le personnel, connecter les parents',
    keywords: ['école', 'onboarding', 'invitation', 'rôles', 'parents', 'super admin', 'classes', 'élèves'],
    blocks: [
      { kind: 'p', text: 'Bienvenue sur EduGest ! Voici le chemin complet pour lancer votre établissement en quelques minutes.' },
      {
        kind: 'list',
        items: [
          'Créer une école : depuis la page d’accueil, cliquez « Créer mon école » et renseignez les informations demandées — nom complet, sigle, ville, province, contacts.',
          'Onboarding guidé : une fois l’école créée, suivez les étapes — création des classes et des sections (Maternelle, Primaire, Secondaire), saisie ou import des élèves, affectation du personnel, configuration des frais scolaires.',
          'Invitations du personnel : invitez vos collaborateurs depuis le menu Personnel. Chacun reçoit un accès limité à son rôle.',
          'Connexion parents : les parents se connectent avec leur numéro de téléphone et leur mot de passe ; ils ne voient que leurs enfants (paiements, résultats, discipline, communications).',
        ],
      },
      { kind: 'p', text: 'Rôles disponibles à l’invitation :' },
      {
        kind: 'list',
        items: [
          'Propriétaire — gestion complète de l’établissement.',
          'Secrétaire — inscriptions, dossiers élèves, documents.',
          'Caisse — encaissements, reçus et suivi des paiements.',
          'Direction Maternelle / Primaire / Secondaire — suivi pédagogique par section.',
          'Discipline — sanctions, listes et incidents.',
          'Enseignant — notes, matières et présences de ses classes.',
          'EPS — activités sportives et évaluations physiques.',
          'Médical — infirmerie, visites et dossiers de santé.',
        ],
      },
    ],
  },
  {
    id: 'corporates',
    title: 'Comptes corporates',
    icon: Building2,
    summary: 'Une entreprise, plusieurs écoles : l’espace multi-écoles',
    keywords: ['corporate', 'entreprise', 'multi-écoles', 'totaux', 'agrégés', 'groupe scolaire', 'entreprises'],
    blocks: [
      { kind: 'p', text: 'Un compte corporate est DIFFÉRENT d’un compte école : une seule entreprise peut posséder PLUSIEURS écoles.' },
      {
        kind: 'list',
        items: [
          'Un groupe scolaire (congrégation, société, fondation…) rattache plusieurs écoles sous une même entité.',
          'L’Espace Corporate affiche les totaux agrégés de toutes les écoles : élèves, classes, personnel et encaissements.',
          'Chaque corporate dispose d’au moins un compte utilisateur dédié (nom, email, téléphone, mot de passe) créé à l’ouverture du compte.',
          'Les comptes corporate sont ouverts par notre équipe : écrivez à contact@edugest.app pour rattacher vos écoles.',
        ],
      },
      { kind: 'note', tone: 'gold', text: 'Vous gérez plusieurs écoles sous une même entité ? Contactez contact@edugest.app pour ouvrir un compte corporate.' },
    ],
  },
  {
    id: 'passage',
    title: 'Passage de classe',
    icon: ArrowRightLeft,
    summary: 'Fonction Professionnel, activée pour votre école, avec repêchage',
    keywords: ['passage de classe', 'premium', 'professionnel', 'activation', 'verrouillé', 'repêchage', 'année suivante'],
    blocks: [
      { kind: 'p', text: 'Le passage de classe fait passer les élèves vers l’année suivante en fin d’année scolaire.' },
      {
        kind: 'list',
        items: [
          'Réservé aux écoles au forfait Professionnel (PREMIUM) et plus.',
          'Même avec le bon forfait, la fonction doit être activée pour votre école : faites-en la demande via un ticket (catégorie Onboarding) et notre équipe l’activera.',
          'Sans activation, la vue reste verrouillée : vous voyez la fonction mais ne pouvez pas l’exécuter.',
          'Le repêchage est inclus : les élèves en échec peuvent être repêchés (rattrapage encadré) au moment du passage.',
        ],
      },
      { kind: 'note', tone: 'warning', text: 'Forfait Professionnel + activation par notre équipe = passage de classe ouvert. En cas de besoin, ouvrez un ticket (catégorie Onboarding).' },
    ],
  },
  {
    id: 'discipline',
    title: 'Discipline',
    icon: ShieldAlert,
    summary: 'Liste Blanche, Grise, Noire — un élève, une seule liste',
    keywords: ['discipline', 'liste blanche', 'liste grise', 'liste noire', 'sanction', 'avertissement', 'gravité', 'incidents'],
    blocks: [
      { kind: 'p', text: 'La vue Discipline réunit trois listes avec des compteurs en temps réel :' },
      {
        kind: 'list',
        items: [
          'Liste Blanche : les élèves sans aucun incident.',
          'Liste Grise : les élèves qui ont reçu des avertissements.',
          'Liste Noire : les élèves sous sanctions graves.',
          'Un élève n’est que dans UNE seule liste à la fois, selon la priorité Noire > Grise > Blanche : une sanction noire masque un avertissement gris ; sans aucun incident, l’élève reste en Liste Blanche.',
          'Filtres disponibles : classe, gravité et tri par date (plus récent / plus ancien d’abord).',
        ],
      },
    ],
  },
  {
    id: 'paiements',
    title: 'Paiements & finances',
    icon: CreditCard,
    summary: 'Encaissements, dettes, situation financière et abonnements',
    keywords: ['paiements', 'encaissements', 'caisse', 'dettes', 'finances', 'abonnement', 'forfait', 'freemium', 'premium', 'upgrade'],
    blocks: [
      {
        kind: 'list',
        items: [
          'Encaissements : la Caisse enregistre les paiements, émet des reçus et suit chaque tranche.',
          'Vérification : contrôle des paiements par l’administration (montants, traçabilité, régularisation).',
          'Dettes : suivi des élèves en retard de paiement et des relances envoyées aux parents.',
          'Situation financière : vue consolidée des entrées, sorties et soldes de l’école.',
        ],
      },
      { kind: 'p', text: 'Forfaits d’abonnement :' },
      {
        kind: 'list',
        items: [
          'FREEMIUM — découverte, fonctions de base.',
          'ESSENTIEL — le quotidien d’une petite école.',
          'STANDARD — école en croissance, plus d’autonomie.',
          'PREMIUM (Professionnel) — débloque le passage de classe et les fonctions avancées.',
          'ENTERPRISE — grands établissements, volume élevé.',
          'CORPORATE — groupes scolaires multi-écoles avec espace corporate.',
        ],
      },
      { kind: 'note', tone: 'gold', text: 'Pour monter en gamme, l’école dépose une demande d’upgrade depuis sa vue Abonnement ; elle est validée par notre équipe avant activation du nouveau forfait.' },
    ],
  },
  {
    id: 'emails',
    title: 'Emails officiels',
    icon: Mail,
    summary: 'Nos trois adresses et l’envoi via Resend',
    keywords: ['email', 'noreply', 'support', 'contact', 'resend', 'boîte d’envoi', 'notifications'],
    blocks: [
      { kind: 'p', text: 'EduGest envoie ses emails depuis trois adresses officielles :' },
      {
        kind: 'list',
        items: [
          'noreply@edugest.app — notifications automatiques (reçus, invitations, réinitialisations). Ne pas répondre.',
          'support@edugest.app — support client : vos tickets et demandes d’aide.',
          'contact@edugest.app — commercial et partenariats (comptes corporate, démonstrations).',
        ],
      },
      {
        kind: 'list',
        items: [
          'Les envois partent via Resend, notre fournisseur d’emails transactionnels.',
          'Chaque message est tracé dans la boîte d’envoi : destinataire, modèle, statut SENT / SIMULATED / FAILED.',
        ],
      },
    ],
  },
  {
    id: 'support',
    title: 'Support & Agent IA',
    icon: LifeBuoy,
    summary: 'Tickets catégorisés + Agent IA disponible 24/7',
    keywords: ['support', 'ticket', 'agent', 'ia', 'chat', 'catégories', 'priorité', 'statut'],
    blocks: [
      {
        kind: 'list',
        items: [
          'Onglet Support → tickets : choisissez une catégorie (Général, Technique, Facturation, Onboarding, Données) et une priorité, puis suivez le statut : Ouvert → En cours → Résolu / Fermé.',
          'L’Agent IA EduGest est disponible 24/7 : il répond immédiatement à vos questions sur la plateforme (élèves, notes, paiements, passage de classe, espace corporate…).',
          'Le support humain prend le relais pour les opérations sensibles : il accomplit les tâches avec les corporates (rattachements, upgrades, configurations).',
        ],
      },
      { kind: 'note', tone: 'success', text: 'Astuce : pour une réponse instantanée, commencez par l’Agent IA — si le cas nécessite une action humaine, ouvrez un ticket et notre équipe intervient.' },
    ],
  },
]

const TIER_ORDER = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE']

function sectionSearchText(s: DocSection): string {
  const parts: string[] = [s.title, s.summary, ...s.keywords]
  for (const b of s.blocks) {
    if (b.kind === 'p' || b.kind === 'note') parts.push(b.text)
    else if (b.kind === 'list') parts.push(...b.items)
  }
  return parts.join(' ').toLowerCase()
}

const NOTE_STYLES: Record<NoteTone, { bg: string; border: string; fg: string }> = {
  gold: { bg: 'oklch(97% 0.03 65)', border: 'oklch(90% 0.07 65)', fg: 'oklch(50% 0.12 65)' },
  success: { bg: 'oklch(97% 0.02 145)', border: 'oklch(90% 0.05 145)', fg: 'oklch(45% 0.11 145)' },
  warning: { bg: 'oklch(97% 0.03 65)', border: 'oklch(90% 0.07 65)', fg: 'oklch(50% 0.12 65)' },
  danger: { bg: 'oklch(97% 0.01 25)', border: 'oklch(90% 0.04 25)', fg: 'oklch(45% 0.15 25)' },
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed" style={{ color: TEXT_PRIMARY }}>
      <span className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0" style={{ background: GOLD }} />
      <span>{children}</span>
    </li>
  )
}

function NoteBox({ tone, text }: { tone: NoteTone; text: string }) {
  const st = NOTE_STYLES[tone]
  return (
    <div className="rounded-xl border px-4 py-3 text-[13px] leading-relaxed" style={{ background: st.bg, borderColor: st.border, color: st.fg }}>
      {text}
    </div>
  )
}

export default function DocumentationView() {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () => (q ? SECTIONS.filter(s => sectionSearchText(s).includes(q)) : SECTIONS),
    [q]
  )

  function goTo(id: string) {
    document.getElementById('doc-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tighter edu-heading-display flex items-center gap-2.5" style={{ color: TEXT_PRIMARY }}>
          <BookOpen size={26} className="text-[oklch(72%_0.15_65)] shrink-0" />
          Documentation
        </h1>
        <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
          Tout savoir sur EduGest : démarrage, corporates, passage de classe, paiements et support.
        </p>
      </div>

      {/* Recherche locale */}
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED_LUXE }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher dans la documentation (ex. « passage », « corporate », « email »)…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border focus:border-[oklch(72%_0.15_65)] transition"
          style={{ borderColor: 'oklch(90% 0.01 175)', color: TEXT_PRIMARY }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
        {/* Sommaire cliquable */}
        <nav className="rounded-2xl border p-4 lg:sticky lg:top-20" style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }} aria-label="Sommaire de la documentation">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2.5" style={{ color: TEXT_MUTED_LUXE }}>Sommaire</p>
          <div className="flex lg:flex-col flex-wrap gap-1.5">
            {SECTIONS.map((s, i) => {
              const dim = q && !visible.some(v => v.id === s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => goTo(s.id)}
                  className={`flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition hover:bg-[oklch(96%_0.008_175)] ${dim ? 'opacity-40' : ''}`}
                  style={{ color: TEXT_PRIMARY }}
                >
                  <span className="grid place-items-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0" style={{ background: 'oklch(95% 0.05 65)', color: 'oklch(55% 0.14 65)' }}>{i + 1}</span>
                  <span className="truncate">{s.title}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Contenu */}
        <div className="space-y-4 min-w-0">
          {visible.length === 0 ? (
            <div className="rounded-2xl border p-10 text-center" style={{ borderColor: 'oklch(90% 0.01 175)' }}>
              <Search size={30} className="mx-auto mb-3" style={{ color: GOLD }} />
              <p className="font-semibold" style={{ color: TEXT_PRIMARY }}>Aucun résultat</p>
              <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Essayez un autre mot-clé — par exemple « passage », « corporate », « discipline » ou « email ».</p>
            </div>
          ) : (
            visible.map((s, idx) => {
              const Icon = s.icon
              return (
                <section
                  key={s.id}
                  id={'doc-' + s.id}
                  className="rounded-2xl border p-5 scroll-mt-20"
                  style={{ borderColor: 'oklch(92% 0.01 175)', background: 'white' }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: 'oklch(95% 0.05 65)' }}>
                      <Icon size={19} style={{ color: GOLD }} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-extrabold leading-tight" style={{ color: TEXT_PRIMARY }}>
                        {idx + 1}. {s.title}
                      </h2>
                      <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.summary}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {s.blocks.map((b, i) => {
                      if (b.kind === 'p') {
                        return <p key={i} className="text-sm leading-relaxed" style={{ color: TEXT_PRIMARY }}>{b.text}</p>
                      }
                      if (b.kind === 'note') return <NoteBox key={i} tone={b.tone} text={b.text} />
                      return (
                        <ul key={i} className="space-y-2">
                          {b.items.map((item, j) => <Bullet key={j}>{item}</Bullet>)}
                        </ul>
                      )
                    })}
                  </div>

                  {/* Pastilles spécifiques : listes de discipline */}
                  {s.id === 'discipline' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: 'oklch(95% 0.04 145)', color: SUCCESS }}>Liste Blanche — sans incident</span>
                      <span className="px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: 'oklch(95% 0.05 65)', color: WARNING }}>Liste Grise — avertissements</span>
                      <span className="px-3 py-1.5 rounded-full text-[11px] font-bold" style={{ background: 'oklch(95% 0.02 25)', color: DANGER }}>Liste Noire — sanctions graves</span>
                    </div>
                  )}

                  {/* Pastilles spécifiques : forfaits */}
                  {s.id === 'paiements' && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {TIER_ORDER.map(t => (
                        <span
                          key={t}
                          className="px-3 py-1.5 rounded-full text-[11px] font-bold font-mono"
                          style={t === 'PREMIUM' || t === 'CORPORATE'
                            ? { background: GOLD, color: '#0a0f0d' }
                            : { background: 'oklch(95% 0.01 175)', color: TEXT_MUTED_LUXE }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
