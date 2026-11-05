import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import vtkOrientationMarkerConstants from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget/Constants';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import type { vtkActor as VtkActor } from '@kitware/vtk.js/Rendering/Core/Actor';
import type { vtkAxesActor as VtkAxesActor } from '@kitware/vtk.js/Rendering/Core/AxesActor';
import type { vtkCubeSource as VtkCubeSource } from '@kitware/vtk.js/Filters/Sources/CubeSource';
import type { vtkGenericRenderWindow as VtkGenericRenderWindow } from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import type { vtkMapper as VtkMapper } from '@kitware/vtk.js/Rendering/Core/Mapper';
import type { vtkOrientationMarkerWidget as VtkOrientationMarkerWidget } from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import type { vtkPlane as VtkPlane } from '@kitware/vtk.js/Common/DataModel/Plane';
import type { vtkRenderer as VtkRenderer } from '@kitware/vtk.js/Rendering/Core/Renderer';

import type { VolumeGeometry } from '../cornerstone/volume';

/**
 * Scena 3D VTK.js (P3-03): gestore isolato dal viewer MPR.
 *
 * Responsabilità: ciclo di vita della ``GenericRenderWindow`` (contesto WebGL,
 * camera, interattore), gestione degli attori e dei piani di clipping,
 * ridimensionamento e rilascio completo delle risorse native.
 *
 * La geometria renderizzata è **l'estensione spaziale del volume** (P3-01): il
 * bounding box fisico orientato secondo la direzione del volume in spazio
 * paziente. Il *volume rendering* e la *mesh* sono demandati a P3-04; qui si
 * costruisce il sistema di riferimento entro cui verranno inseriti.
 */

type Vec3 = [number, number, number];

/** Assi di clipping (coordinate mondo/paziente). */
export type ClipAxis = 'x' | 'y' | 'z';

export const CLIP_AXES: readonly ClipAxis[] = ['x', 'y', 'z'];

/** Etichetta anatomica dell'asse di clipping (sistema paziente DICOM). */
export const CLIP_AXIS_LABEL: Record<ClipAxis, string> = {
  x: 'L / R',
  y: 'A / P',
  z: 'S / I',
};

export interface ClipBound {
  min: number;
  max: number;
}

const BACKGROUND: Vec3 = [0.07, 0.09, 0.12];
const BOX_COLOR: Vec3 = [0.29, 0.64, 1];
const EDGE_COLOR: Vec3 = [0.45, 0.73, 1];
const BOX_OPACITY = 0.14;

/** Estensione fisica del volume lungo un asse (dai centri dei voxel estremi). */
function axisLength(geometry: VolumeGeometry, axis: 0 | 1 | 2): number {
  const spacing = geometry.spacing[axis] || 1;
  const count = geometry.dimensions[axis];
  return Math.max(spacing * Math.max(count - 1, 1), spacing, 1e-3);
}

/** Coordinate mondo di un vertice del volume (indici voxel in spazio paziente). */
function voxelToWorld(geometry: VolumeGeometry, i: number, j: number, k: number): Vec3 {
  const [rx, ry, rz, cx, cy, cz, nx, ny, nz] = geometry.direction;
  const [sx, sy, sz] = geometry.spacing;
  const [ox, oy, oz] = geometry.origin;
  return [
    ox + (rx ?? 0) * sx * i + (cx ?? 0) * sy * j + (nx ?? 0) * sz * k,
    oy + (ry ?? 0) * sx * i + (cy ?? 0) * sy * j + (ny ?? 0) * sz * k,
    oz + (rz ?? 0) * sx * i + (cz ?? 0) * sy * j + (nz ?? 0) * sz * k,
  ];
}

/**
 * Estremi (allineati agli assi mondo) del volume: inviluppo dei suoi vertici,
 * usato per le forbici degli slider di clipping. Il box fisico è orientato, ma
 * il clipping su un asse paziente è più comprensibile per l'utente.
 */
function worldBounds(geometry: VolumeGeometry): Record<ClipAxis, ClipBound> {
  const [di, dj, dk] = geometry.dimensions;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const i of [0, di - 1]) {
    for (const j of [0, dj - 1]) {
      for (const k of [0, dk - 1]) {
        const [x, y, z] = voxelToWorld(geometry, i, j, k);
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x);
        max[1] = Math.max(max[1], y);
        max[2] = Math.max(max[2], z);
      }
    }
  }
  return {
    x: { min: min[0], max: max[0] },
    y: { min: min[1], max: max[1] },
    z: { min: min[2], max: max[2] },
  };
}

/** Matrice colonna-prima (vtk ``mat4``) che porta il box locale in mondo. */
function orientationMatrix(geometry: VolumeGeometry): Float32Array {
  const [rx, ry, rz, cx, cy, cz, nx, ny, nz] = geometry.direction;
  const center = voxelToWorld(
    geometry,
    (geometry.dimensions[0] - 1) / 2,
    (geometry.dimensions[1] - 1) / 2,
    (geometry.dimensions[2] - 1) / 2,
  );
  // prettier-ignore
  return new Float32Array([
    rx ?? 0, ry ?? 0, rz ?? 0, 0,
    cx ?? 0, cy ?? 0, cz ?? 0, 0,
    nx ?? 0, ny ?? 0, nz ?? 0, 0,
    center[0], center[1], center[2], 1,
  ]);
}

interface ManagedActor {
  actor: VtkActor;
  mapper: VtkMapper;
  source: VtkCubeSource;
}

/** Bounding box solido e semitrasparente del volume, con spigoli evidenziati. */
function createVolumeBox(geometry: VolumeGeometry): ManagedActor {
  const source = vtkCubeSource.newInstance({
    xLength: axisLength(geometry, 0),
    yLength: axisLength(geometry, 1),
    zLength: axisLength(geometry, 2),
  });

  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(source.getOutputPort());

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.setUserMatrix(orientationMatrix(geometry));

  const property = actor.getProperty();
  property.setColor(...BOX_COLOR);
  property.setEdgeVisibility(true);
  property.setEdgeColor(...EDGE_COLOR);
  property.setLineWidth(1.5);
  property.setOpacity(BOX_OPACITY);

  return { actor, mapper, source };
}

export class Scene3D {
  private readonly container: HTMLElement;
  private readonly renderWindow: VtkGenericRenderWindow;
  private readonly renderer: VtkRenderer;
  private readonly box: ManagedActor;
  private readonly planes: Record<ClipAxis, VtkPlane>;
  private readonly bounds: Record<ClipAxis, ClipBound>;
  private orientationWidget: VtkOrientationMarkerWidget | null = null;
  private axesActor: VtkAxesActor | null = null;
  private framed = false;
  private disposed = false;

  constructor(container: HTMLElement, geometry: VolumeGeometry) {
    this.container = container;
    this.bounds = worldBounds(geometry);

    this.renderWindow = vtkGenericRenderWindow.newInstance({
      background: BACKGROUND,
      listenWindowResize: false,
    });
    this.renderWindow.setContainer(container);
    this.renderer = this.renderWindow.getRenderer();
    this.renderer.setBackground(...BACKGROUND);

    this.box = createVolumeBox(geometry);
    this.renderer.addActor(this.box.actor);

    this.planes = {
      x: vtkPlane.newInstance({ normal: [1, 0, 0], origin: [this.bounds.x.min, 0, 0] }),
      y: vtkPlane.newInstance({ normal: [0, 1, 0], origin: [0, this.bounds.y.min, 0] }),
      z: vtkPlane.newInstance({ normal: [0, 0, 1], origin: [0, 0, this.bounds.z.min] }),
    };

    this.installOrientationMarker();
    this.resize();
  }

  /** Gizmo di orientamento anatomico nell'angolo, indipendente dalla camera. */
  private installOrientationMarker(): void {
    try {
      this.axesActor = vtkAxesActor.newInstance();
      this.orientationWidget = vtkOrientationMarkerWidget.newInstance({
        actor: this.axesActor,
        interactor: this.renderWindow.getInteractor(),
      });
      this.orientationWidget.setParentRenderer(this.renderer);
      this.orientationWidget.setViewportCorner(vtkOrientationMarkerConstants.Corners.TOP_RIGHT);
      this.orientationWidget.setViewportSize(0.16);
      this.orientationWidget.setMinPixelSize(80);
      this.orientationWidget.setMaxPixelSize(220);
      this.orientationWidget.setEnabled(true);
    } catch {
      // Il gizmo è decorativo: un errore non deve impedire il rendering del volume.
      this.orientationWidget = null;
      this.axesActor = null;
    }
  }

  /** Estremi degli assi per gli slider di clipping (coordinate mondo). */
  getClipBounds(): Record<ClipAxis, ClipBound> {
    return this.bounds;
  }

  /** Inquadra l'intera scena (fit della camera su tutti gli attori visibili). */
  resetCamera(): void {
    if (this.disposed) return;
    this.renderer.resetCamera();
    this.framed = true;
    this.render();
  }

  /** Ridimensiona il contesto WebGL alla dimensione del contenitore. */
  resize(): void {
    if (this.disposed) return;
    if (this.container.clientWidth === 0 || this.container.clientHeight === 0) return;
    this.renderWindow.resize();
    if (!this.framed) {
      this.renderer.resetCamera();
      this.framed = true;
    }
    this.render();
  }

  /** Sposta il piano di clipping sull'asse indicato (posizione mondo). */
  setClip(axis: ClipAxis, value: number): void {
    if (this.disposed) return;
    if (axis === 'x') this.planes.x.setOrigin(value, 0, 0);
    else if (axis === 'y') this.planes.y.setOrigin(0, value, 0);
    else this.planes.z.setOrigin(0, 0, value);
    this.render();
  }

  /** Abilita/disabilita il piano di clipping sull'asse indicato. */
  setClipEnabled(axis: ClipAxis, enabled: boolean): void {
    if (this.disposed) return;
    const plane = this.planes[axis];
    if (enabled) this.box.mapper.addClippingPlane(plane);
    else this.box.mapper.removeClippingPlane(plane);
    this.render();
  }

  /** Rimuove tutti i piani di clipping e riporta ogni asse al minimo. */
  resetClipping(): void {
    if (this.disposed) return;
    this.box.mapper.removeAllClippingPlanes();
    for (const axis of CLIP_AXES) this.setClip(axis, this.bounds[axis].min);
    this.render();
  }

  private render(): void {
    if (this.disposed) return;
    this.renderWindow.getRenderWindow().render();
  }

  /** Rilascia contesto WebGL, attori e oggetti nativi. Idempotente. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    try {
      this.orientationWidget?.setEnabled(false);
      this.orientationWidget?.delete();
    } catch {
      /* widget già rilasciato */
    }
    this.orientationWidget = null;
    this.axesActor?.delete();
    this.axesActor = null;

    try {
      this.box.mapper.removeAllClippingPlanes();
    } catch {
      /* mapper già rilasciato */
    }
    for (const axis of CLIP_AXES) this.planes[axis].delete();

    this.renderer.removeActor(this.box.actor);
    this.box.actor.delete();
    this.box.mapper.delete();
    this.box.source.delete();

    this.renderWindow.delete();
    this.container.replaceChildren();
  }
}
