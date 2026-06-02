---
Task ID: 1
Agent: Main Agent
Task: Implement all requested features and fixes for EduGest

Work Log:
- Analyzed full codebase (2895-line page.tsx, 16 Prisma models, 12 API routes)
- Created payment receipt PDF API at /api/payments/receipt/[id] using pdfkit
- Created profile photo upload API at /api/upload using FormData + file system
- Created WhatsApp auth API at /api/auth/whatsapp with send/verify code flow
- Created WhatsApp config API at /api/whatsapp-config for SUPER_ADMIN_GLOBAL
- Modified /api/payments POST to validate student names and return French error messages
- Modified /api/students POST to support parent creation (name, email, phone, password)
- Fixed PaymentsView: added working submit handler, student autocomplete search, paidAmount field, status selector, PDF receipt download
- Fixed ProfileView: added photo upload via clickable avatar, working save button with store update
- Fixed StudentsView: added class selector dropdown, expandable parent info section with all fields
- Improved all table designs with avatar initials, better padding, consistent styling
- Implemented WhatsApp login modal with phone input and 6-digit code verification
- Added WhatsAppConfigView component in SUPER_ADMIN_GLOBAL sidebar with premium theme
- Added 'whatsapp-config' to ViewType in store.ts
- Fixed fileInputRef to use useRef instead of useState in ProfileView
- All features verified with agent-browser

Stage Summary:
- Payment system now works end-to-end: search student → submit → download PDF receipt
- Error message "Le nom de l'élève a été mal écrit ou il n'existe pas" when student not found
- Profile photo upload functional with click-to-upload on avatar
- Student creation supports parent info (name, email, phone, password) and class selection
- Tables redesigned with premium Luxe Africain theme (avatar initials, gold headers, better spacing)
- WhatsApp login flow: phone → code → authenticate
- WhatsApp config in SUPER_ADMIN_GLOBAL dashboard for managing official number
- Lint passes, dev server compiles without errors
