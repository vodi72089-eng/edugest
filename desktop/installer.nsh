; Look School 360 — personnalisation de l'assistant d'installation.
; Inclus via "nsis.include" dans desktop/package.json (macro customHeader).
;
; Titre des fenêtres en français : NSIS affiche par défaut
; « Installation de Look School 360 ». Grammaire correcte : « d'Look School 360 ».
; (Attributs Caption directs — déterministes, pas de conflit LangString.)
!macro customHeader
  Caption "Installation d'Look School 360"
  UninstallCaption "Désinstallation d'Look School 360"
!macroend
