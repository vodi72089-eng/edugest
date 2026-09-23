# Design: Algorithme de Classification Disciplinaire Automatique

## Objectif

Automatiser la classification des élèves dans les listes disciplinaires (Noire, Grise, Blanche) en se basant sur l'historique des sanctions, la gravité, et les causes écrites par le personnel. L'algorithme apprend des décisions manuelles du personnel.

## Règles de Classification

### 1. Liste Noire (BLACKLIST) — Immédiate

L'élève est **automatiquement** placé en liste noire si :

- **Sévérité CRITICAL** : Toute sanction avec `severity = CRITICAL` → direct liste noire
- **Mots-clés critiques** : Si la description contient un mot-clé critique (violence, arme, drogue, vol, agression, menace, etc.) → direct liste noire
- **Seuil de points** : Si le total des points cumulés ≤ -10 → escalade automatique vers liste noire
- **Répétition du même type grave** : 3+ sanctions de type VIOLENCE ou TRICHERIE → liste noire

### 2. Liste Grise (GREYLIST) — Par Défaut

- Toute sanction négative non critique commence en liste grise
- Points entre -1 et -9
- C'est la liste par défaut (`listType = 'GREYLIST'`)

### 3. Liste Blanche (WHITELIST) — Uniquement positif

- Uniquement les sanctions positives (type EXCELLENCE ou MERITE)
- Points > 0
- Jamais automatiquement classée en liste noire

## Mécanisme d'Apprentissage

### Stockage des mots-clés appris

Nouvelle table `DisciplineKeyword` :
```prisma
model DisciplineKeyword {
  id        String   @id @default(cuid())
  keyword   String
  listType  String   // BLACKLIST, GREYLIST, WHITELIST
  schoolId  String
  learnedFrom String // ID du DisciplineRecord d'origine
  createdAt DateTime @default(now())

  @@unique([keyword, schoolId])
}
```

### Processus d'apprentissage

1. Quand le personnel discipline met **manuellement** un élève en liste noire via l'interface
2. L'algorithme extrait les mots-clés significatifs du titre + description (mots > 3 caractères, sans les mots vides)
3. Les mots-clés sont stockés dans `DisciplineKeyword` avec `listType = 'BLACKLIST'`
4. Ces mots-clés sont utilisés pour les futures classifications automatiques

### Mots-clés statiques (prédéfinis)

Liste de base pour la classification :
- **BLACKLIST** : violence, arme, drogue, vol, agression, menace, harcèlement, incendie, dégradation
- **WHITELIST** : excellence, mérite, brilliance, example, leadership

## Fonction de Classification

```
classifyStudent(studentId, schoolId) → { listType, reason, autoClassified }
```

### Logique :

1. Compter le total des points du student (somme de tous les `DisciplineRecord.points`)
2. Compter les sanctions par type et par sévérité
3. Vérifier les mots-clés statiques + appris dans les descriptions récentes
4. Appliquer les règles dans l'ordre de priorité :
   - CRITICAL severity → BLACKLIST
   - Mot-clé critique trouvé → BLACKLIST
   - Points ≤ -10 → BLACKLIST
   - 3+ VIOLENCE ou TRICHERIE → BLACKLIST
   - Sinon → GREYLIST (si points négatifs) ou WHITELIST (si points positifs)

### Quand déclencher la classification :

- Après création d'un `DisciplineRecord` (POST `/api/discipline`)
- Après mise à jour d'un `DisciplineRecord` (PUT `/api/discipline`)
- Sur demande manuelle (bouton "Classifier" dans l'interface)

## API Endpoints

### POST `/api/discipline/classify`
- Body: `{ studentId, schoolId }`
- Retourne: `{ listType, reason, details, autoClassified }`
- Side effect: Met à jour le `listType` du `DisciplineRecord` et crée/met à jour les entrées dans les tables de listes

### GET `/api/discipline/keywords?schoolId=...`
- Retourne la liste des mots-clés appris pour une école

### DELETE `/api/discipline/keywords/[id]`
- Supprime un mot-clé appris

## Modifications UI

### DisciplineView
- Ajouter un bouton "Classifier automatiquement" pour chaque élève
- Afficher un badge "Auto" quand la classification est automatique
- Ajouter un onglet "Mots-clés appris" pour voir/gerer les mots-clés

### DisciplineDashboard
- Ajouter une carte "Classifications automatiques" avec le nombre total

## Fichiers à Modifier/Créer

### Nouveaux fichiers :
- `src/app/api/discipline/classify/route.ts` — API de classification
- `src/app/api/discipline/keywords/route.ts` — API des mots-clés
- `src/lib/discipline-classifier.ts` — Logique de classification
- `prisma/migrations/...` — Migration pour la table `DisciplineKeyword`

### Fichiers à modifier :
- `prisma/schema.prisma` — Ajouter le modèle `DisciplineKeyword`
- `src/app/api/discipline/route.ts` — Déclencher la classification après création/mise à jour
- `src/components/views/DisciplineView.tsx` — Ajouter bouton classification et onglet mots-clés
- `src/components/dashboards/DisciplineDashboard.tsx` — Ajouter statistique classifications auto
- `src/lib/types.ts` — Ajouter type `DisciplineKeywordData`

## Contraintes

- Pas d'IA externe (OpenAI, etc.)
- Tout fonctionne en local avec des règles
- L'algorithme est déterministe et prévisible
- Le personnel peut toujours overrides manuellement
- Les classifications automatiques sont marquées comme `autoClassified = true`
