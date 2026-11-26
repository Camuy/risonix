# Safari/macOS — immagini nere: causa radice e fix

## Causa radice (verificata)

Il **primo** errore è nella creazione del contesto di rendering, non in texture, shader o volume:

- vtk.js (`vtkOpenGLRenderWindow.get3DContext`) crea i contesti con
  `powerPreference: 'high-performance'` cablato come default, senza punto di configurazione.
- Sul Safari 18.5 / macOS 15.5 (M1 Pro) di sviluppo, `getContext('webgl2'|'webgl', { powerPreference: 'high-performance' })`
  restituisce un contesto **già perso** (`isContextLost() === true` alla creazione, `webglcontextrestored` mai emesso).
  Con `default` o `low-power` il contesto è valido.
- Il resto della catena (`WebGL: context lost`, `Hardware does not support the number of textures defined`,
  `shaderSource ... must be an instance of WebGLShader`) è cascata di quel contesto morto.

Evidenze (pagina WebGL pura, senza Cornerstone/vtk, 3 ripetizioni, canvas attaccato/staccato, webgl1/webgl2,
con/senza `loseContext` precedente):

| Opzioni `getContext` | Safari | Chrome |
| --- | --- | --- |
| `{ powerPreference: 'high-performance' }` | contesto perso | ok |
| `{ powerPreference: 'low-power' }` / `'default'` / nessuna | ok | ok |

Esclusi con prova: `texStorage2D` vs `texImage2D`, norm16, numero di contesti, `WEBGL_lose_context` del probe
Cornerstone, volume rendering, memoria GPU.

Nota: lo stesso hint in un `WKWebView` appena avviato (stesso WebKit, stessa GPU) **non** fallisce; il difetto è quindi
legato all'istanza/stato di Safari (processo attivo da 35 giorni), non a WebKit in generale. Non è stato provato il
riavvio di Safari: non si afferma che il riavvio lo risolva. Il fix sotto rende l'app indipendente da questo stato.

## Fix

`src/cornerstone/webglContext.ts`: all'avvio (`ensureCornerstone`) una creazione di prova verifica se un contesto
`high-performance` è utilizzabile. Solo se risulta già perso, `HTMLCanvasElement.prototype.getContext` abbassa
l'hint a `default` per i contesti WebGL successivi (rendering engine Cornerstone e scena 3D vtk.js).
Nessun user-agent sniffing; su Chrome il patch non viene installato.

Rimosso: `cornerstone/platform.ts` e il blocco MPR/3D su WebKit (nascondevano il sintomo).

## Verifica

Safari 18.5/macOS 15.5, rendering reale dell'app (probe su ogni chiamata WebGL, `getError` dopo ogni comando):

| Layout | Contesto di rendering perso | Errori GL / eccezioni | Draw call |
| --- | --- | --- | --- |
| 1x1 (stack 2D) | no | 0 | sì (texImage2D) |
| MPR | no | 0 | sì (texImage3D, texSubImage3D) |
| 3D | no | 0 | sì (texImage3D, 293 draw) |

Chrome (headless, stessa macchina): 1x1, MPR e 3D senza errori, senza patch installato.

Non verificati: iPhone/iPad/Android, dataset 16 bit con molte slice, 20 aperture consecutive, tab in background.

## Riprodurre la diagnosi

Pagina minima: `canvas.getContext('webgl2', { powerPreference: 'high-performance' }).isContextLost()` in Safari.
`true` = il difetto è presente nell'istanza di Safari in uso.
