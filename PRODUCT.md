# Product

## Register

product

## Users

Radiologi, tecnici di radiologia e ricercatori di imaging biomedico. Usano la
workstation da un browser, spesso su una singola macchina self-hosted, in una
stanza di refertazione con luce ambientale bassa. Il lavoro tipico è aprire un
esame, scorrere una serie, confrontare piani e ricavare misure affidabili. Il
contesto impone sessioni lunghe, attenzione visiva e nessuna distrazione: la UI
serve l'immagine, non il contrario.

## Product Purpose

Risonix è una workstation di imaging self-hosted per l'analisi di volumi RM.
Importa DICOM dal filesystem, ne valida la geometria e li rende consultabili
come volumi NIfTI/NRRD, con viewer multi-viewport, misure e, più avanti, AI e
strumenti quantitativi. Il successo è un radiologo che si fida della geometria e
legge la stessa immagine che vedrebbe su una console diagnostica, senza dipendere
da servizi esterni.

## Brand Personality

Clinico, sobrio, preciso. Tono impersonale e tecnico, mai promozionale. L'interfaccia deve trasmettere affidabilità e silenzio: si fa notare per la
leggibilità dei dati, non per effetti visivi. Tre parole: *clinico, denso,
discreto*.

## Anti-references

- Dashboard SaaS generiche: hero con metriche giganti, card arrotondate
  oversized, gradienti, glassmorphism, eyebrow in maiuscolo ripetute.
- Interfacce consumer/social con animazioni continue e decorazione fine a se
  stessa.
- Console diagnostiche sovraccariche di cromia che altera la percezione dei
  toni di grigio dell'immagine.

## Design Principles

1. **L'immagine prima di tutto.** La cromia dell'interfaccia è neutra e scura
   per non alterare la lettura dei toni di grigio; nessun elemento decorativo
   sottrae spazio al viewport.
2. **Stato sempre esplicito.** Ogni schermata dichiara il proprio stato
   (loading, empty, success, error): mai aree mute o ambigue.
3. **Densità controllata.** Informazioni compatte ma leggibili: gerarchia per
   scala e peso, non per decorazione.
4. **Un'unica fonte di verità visiva.** Colore, spazio, tipo e movimento
   derivano da design token; nessun valore hard-coded sparso.
5. **Rispetto dell'operatore.** Contrasto AA, focus visibile, navigazione da
   tastiera, movimento ridotto su richiesta.

## Accessibility & Inclusion

Obiettivo WCAG 2.1 AA. Testo corpo ≥ 4.5:1 e testo grande ≥ 3:1 sul proprio
sfondo. Focus da tastiera sempre visibile. I pannelli ridimensionabili sono
azionabili anche da tastiera (frecce su un separatore con `role="separator"`).
Lo stato non è comunicato dal solo colore (etichetta testuale di accompagnamento).
Le animazioni rispettano `prefers-reduced-motion`. Font di sistema con fallback,
`font-variant-numeric: tabular-nums` per i valori numerici.
