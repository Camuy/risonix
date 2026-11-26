/**
 * vtk.js (usato da Cornerstone3D per ogni rendering engine e dalla scena 3D)
 * crea i contesti WebGL con `powerPreference: 'high-performance'` cablato come
 * default in `vtkOpenGLRenderWindow.get3DContext`, senza alcun punto di
 * configurazione.
 *
 * Su alcune istanze di Safari/macOS `getContext` con quell'hint restituisce un
 * contesto GIÀ PERSO (`isContextLost() === true` alla creazione, mai ripristinato),
 * mentre `default`/`low-power` funzionano. Da quel primo errore derivano a
 * cascata `WebGL: context lost`, `Hardware does not support the number of
 * textures defined` e `shaderSource ... must be an instance of WebGLShader`.
 *
 * `powerPreference` è solo un suggerimento: se il browser non è in grado di
 * onorarlo lo si abbassa a `default`, validando il comportamento reale con una
 * creazione di prova (nessun user-agent sniffing). Il patch di `getContext` è
 * installato solo quando la prova fallisce.
 */

const HIGH_PERFORMANCE: WebGLContextAttributes = { powerPreference: 'high-performance' };

function highPerformanceContextIsUsable(): boolean {
  const gl = document.createElement('canvas').getContext('webgl2', HIGH_PERFORMANCE);
  return gl !== null && !gl.isContextLost();
}

function downgradePowerPreference(): void {
  const proto = HTMLCanvasElement.prototype;
  const original = proto.getContext as (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ) => RenderingContext | null;

  (proto as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ): RenderingContext | null {
    const isWebGL = contextId === 'webgl2' || contextId === 'webgl' || contextId === 'experimental-webgl';
    const attributes = options as WebGLContextAttributes | undefined;
    if (isWebGL && attributes?.powerPreference === 'high-performance') {
      return original.call(this, contextId, { ...attributes, powerPreference: 'default' });
    }
    return original.call(this, contextId, options);
  };
}

let installed = false;

/** Da chiamare prima di creare qualsiasi rendering engine o scena vtk.js. */
export function ensureUsableWebGLContextHints(): void {
  if (installed) return;
  installed = true;
  if (!highPerformanceContextIsUsable()) {
    console.warn(
      "WebGL: il browser restituisce un contesto perso con powerPreference 'high-performance'; si usa 'default'.",
    );
    downgradePowerPreference();
  }
}
