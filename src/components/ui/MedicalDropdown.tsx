'use client';

import AppSelect, { DropdownOption } from './AppSelect';

export type { DropdownOption } from './AppSelect';

interface MedicalDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | DropdownOption>;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Composant historique de la vue Médicale — délègue désormais à AppSelect
 * (le dropdown personnalisé unifié de l'app) pour un rendu strictement identique.
 */
export default function MedicalDropdown(props: MedicalDropdownProps) {
  return <AppSelect {...props} />;
}
