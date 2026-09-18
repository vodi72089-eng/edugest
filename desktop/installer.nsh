; EduGest — personnalisation de l'assistant d'installation.
; Inclus via "nsis.include" dans desktop/package.json (macro customHeader).
;
; Titre des fenêtres en français : NSIS affiche par défaut
; « Installation de EduGest ». Grammaire correcte : « d'EduGest ».
; (Attributs Caption directs — déterministes, pas de conflit LangString.)
!macro customHeader
  Caption "Installation d'EduGest"
  UninstallCaption "Désinstallation d'EduGest"
!macroend
