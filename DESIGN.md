# Design System — Risonix (MRI Explorer)

> Superficie: **product** (workstation di imaging). Design *serve* il prodotto.
> Fonte di verità dei token: `apps/frontend/src/styles/tokens.css`.

## Overview

Tema **dark ad alto contrasto**, neutro e a bassa saturazione, così da non
alterare la percezione dei toni di grigio dell'immagine. Un solo accento
clinico (ciano) segnala interattività e focus. Niente gradienti, card oversized
o animazioni superflue. Layout a pannelli con toolbar in alto e status bar in
basso; il viewport occupa lo spazio residuo.

Strategia di colore: **restrained** (neutri tinti + un accento ≤ 10%).

## Colors

Superfici e inchiostro sono neutri con una minima tinta fredda (hue ≈ 255,
chroma ≤ 0.016). Tutti i valori in OKLCH.

| Token | OKLCH | Ruolo |
| ----- | ----- | ----- |
| `--color-bg-inset` | `0.115 0.010 255` | Well più profondo (viewport, campi) |
| `--color-bg-base` | `0.145 0.010 255` | Sfondo applicazione |
| `--color-bg-surface` | `0.185 0.012 255` | Pannelli, toolbar, status bar |
| `--color-bg-raised` | `0.225 0.014 255` | Elementi sollevati / hover |
| `--color-bg-overlay` | `0.255 0.016 255` | Popover, selezioni |
| `--color-border` | `0.300 0.014 255` | Bordi standard |
| `--color-border-strong` | `0.400 0.016 255` | Bordi a fuoco / separatori attivi |
| `--color-text` | `0.940 0.006 255` | Testo primario |
| `--color-text-muted` | `0.740 0.010 255` | Testo secondario |
| `--color-text-faint` | `0.600 0.012 255` | Testo terziario / disabilitato |

Accento e stato (unico uso di croma):

| Token | OKLCH | Ruolo |
| ----- | ----- | ----- |
| `--color-accent` | `0.720 0.130 215` | Azione, link, focus |
| `--color-accent-hover` | `0.780 0.130 215` | Hover accento |
| `--color-accent-active` | `0.660 0.130 215` | Premuto accento |
| `--color-accent-contrast` | `0.150 0.020 215` | Testo su fondo accento |
| `--color-success` | `0.750 0.150 155` | Stato positivo |
| `--color-warning` | `0.820 0.140 085` | Attenzione |
| `--color-danger` | `0.700 0.190 025` | Errore |

Contrasto: `--color-text` su `--color-bg-base` ≫ 4.5:1; `--color-text-muted` su
surface ≳ 7:1. Lo stato è sempre accompagnato da etichetta testuale.

## Typography

Due famiglie: sans di sistema per l'interfaccia, monospace per numeri, UID e
valori di misura. Cap di tre famiglie; qui due.

- `--font-sans`: `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- `--font-mono`: `ui-monospace, 'SFMono-Regular', 'Cascadia Code', 'Roboto Mono', Menlo, Consolas, monospace`

Scala (rapporto ≈ 1.2–1.25), densa per una UI di lavoro:

| Token | px | Uso |
| ----- | -- | --- |
| `--text-2xs` | 11 | Micro-etichette, badge |
| `--text-xs` | 12 | Etichette, status bar |
| `--text-sm` | 13 | **Corpo UI** (default) |
| `--text-md` | 14 | Enfasi, titoli pannello |
| `--text-lg` | 16 | Titoli sezione |
| `--text-xl` | 20 | Titolo applicazione |

I numeri usano `font-variant-numeric: tabular-nums`. Interlinea: `--leading-tight`
(1.25) per titoli, `--leading-normal` (1.5) per il testo.

## Layout & Spacing

Scala di spaziatura a 4px: `2, 4, 6, 8, 12, 16, 24, 32` (`--space-1`…`--space-8`).

Struttura a pannelli (flex + grid), dashboard desktop:

```
┌───────────────────────────────────────────────┐
│ Toolbar (44px)                                 │
├──────────┬────────────────────────┬────────────┤
│ Sidebar  │  Viewport (flex: 1)     │  Sidebar   │
│ sinistra │                         │  destra    │
├──────────┴────────────────────────┴────────────┤
│ Status bar (26px)                              │
└───────────────────────────────────────────────┘
```

- Pannelli ridimensionabili via separatore (`--resizer-size: 5px`), min 200px,
  max 520px; larghezza persistita.
- Il viewport ha `min-width: 0` e non viene mai coperto da elementi decorativi.
- Radii contenuti: `--radius-sm: 4px`, `--radius-md: 6px` (card/superfici).
- z-index semantico: `--z-panel:10`, `--z-dropdown:100`, `--z-overlay:300`,
  `--z-modal:400`, `--z-toast:500`, `--z-tooltip:600`.

## Components

- **Toolbar**: brand a sinistra, toggle pannelli, azioni a destra; bordo inferiore.
- **Pannello**: intestazione con titolo + azioni, corpo scrollabile, empty state.
- **Separatore ridimensionabile**: 5px, cursore `col-resize`, focus ring,
  `role="separator"` con frecce per la tastiera.
- **Viewport**: well scuro; ospiterà i canvas Cornerstone (P2-02).
- **Status bar**: stato servizi (dot + etichetta + versione), metadati a destra.
- **StateMessage**: varianti `loading | empty | success | error`, con icona,
  titolo, descrizione e azione opzionale. Usato per gli stati del viewport.
- **Bottoni/IconButton**: verbo + oggetto per le etichette; le icone hanno
  `aria-label`.

## Motion

Sobria e funzionale. Easing `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`;
durate `--dur-fast: 120ms`, `--dur: 180ms`. Si animano opacità, colore e
transform, non le proprietà di layout. `prefers-reduced-motion: reduce` riduce
le transizioni a un crossfade/istantaneo.
