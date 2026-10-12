; Kelasi 360 — personnalisation de l'assistant d'installation.
; Inclus via "nsis.include" dans desktop/package.json (macro customHeader).
;
; Titre des fenêtres en français : NSIS affiche par défaut
; « Installation de Kelasi 360 ». Grammaire correcte : « de Kelasi 360 ».
; (Attributs Caption directs — déterministes, pas de conflit LangString.)
!macro customHeader
  Caption "Installation de Kelasi 360"
  UninstallCaption "Désinstallation de Kelasi 360"
!macroend
