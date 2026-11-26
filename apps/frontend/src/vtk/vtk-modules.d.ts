/**
 * I profili di rendering di VTK.js espongono i mapper OpenGL come effetto
 * collaterale dell'import e non pubblicano dichiarazioni di tipo. Queste
 * dichiarazioni ambientali soddisfano ``noUncheckedSideEffectImports`` per
 * gli import dei profili Geometria e Volume usati dalla scena 3D (P3-03/P3-04).
 */
declare module '@kitware/vtk.js/Rendering/Profiles/Geometry';
declare module '@kitware/vtk.js/Rendering/Profiles/Volume';

/**
 * ``ImageMarchingCubes`` è distribuito senza dichiarazioni di tipo nel pacchetto
 * VTK.js 36.4.1. L'interfaccia minima copre l'uso della scena 3D (P3-04):
 * filtro su ``vtkImageData`` che produce una superficie ``vtkPolyData``.
 */
declare module '@kitware/vtk.js/Filters/General/ImageMarchingCubes' {
  import type { vtkAlgorithm } from '@kitware/vtk.js/interfaces';
  import type vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
  import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';

  export interface IImageMarchingCubesInitialValues {
    contourValue?: number;
    computeNormals?: boolean;
    mergePoints?: boolean;
  }

  export interface vtkImageMarchingCubes {
    setInputData(data: vtkImageData): void;
    setContourValue(value: number): boolean;
    getContourValue(): number;
    setComputeNormals(flag: boolean): boolean;
    setMergePoints(flag: boolean): boolean;
    getOutputPort(): ReturnType<vtkAlgorithm['getOutputPort']>;
    getOutputData(): vtkPolyData;
    update(): void;
    modified(): void;
    delete(): void;
  }

  const vtkImageMarchingCubes: {
    newInstance(initialValues?: IImageMarchingCubesInitialValues): vtkImageMarchingCubes;
  };
  export default vtkImageMarchingCubes;
}

/**
 * ``WindowedSincPolyDataFilter`` smoothing della mesh di superficie, anch'esso
 * distribuito senza dichiarazioni di tipo in VTK.js 36.4.1. L'interfaccia
 * minima copre l'uso nella pipeline di superficie (P3-04).
 */
declare module '@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter' {
  import type { vtkAlgorithm } from '@kitware/vtk.js/interfaces';

  export interface IWindowedSincPolyDataFilterInitialValues {
    numberOfIterations?: number;
    passBand?: number;
    featureAngle?: number;
    edgeAngle?: number;
    featureEdgeSmoothing?: boolean | number;
    boundarySmoothing?: boolean | number;
    nonManifoldSmoothing?: boolean | number;
    normalizeCoordinates?: boolean | number;
  }

  export interface vtkWindowedSincPolyDataFilter {
    setInputConnection(port: ReturnType<vtkAlgorithm['getOutputPort']>): void;
    getOutputPort(): ReturnType<vtkAlgorithm['getOutputPort']>;
    setNumberOfIterations(value: number): boolean;
    setPassBand(value: number): boolean;
    update(): void;
    delete(): void;
  }

  const vtkWindowedSincPolyDataFilter: {
    newInstance(
      initialValues?: IWindowedSincPolyDataFilterInitialValues,
    ): vtkWindowedSincPolyDataFilter;
  };
  export default vtkWindowedSincPolyDataFilter;
}

/**
 * ``PolyDataNormals`` ricalcola le normali dopo lo smoothing (senza tipi nel
 * pacchetto). Necessario perché la geometria levigata richiede normali coerenti.
 */
declare module '@kitware/vtk.js/Filters/Core/PolyDataNormals' {
  import type { vtkAlgorithm } from '@kitware/vtk.js/interfaces';

  export interface IPolyDataNormalsInitialValues {
    computePointNormals?: boolean;
    computeCellNormals?: boolean;
  }

  export interface vtkPolyDataNormals {
    setInputConnection(port: ReturnType<vtkAlgorithm['getOutputPort']>): void;
    getOutputPort(): ReturnType<vtkAlgorithm['getOutputPort']>;
    setComputePointNormals(flag: boolean): boolean;
    setComputeCellNormals(flag: boolean): boolean;
    update(): void;
    delete(): void;
  }

  const vtkPolyDataNormals: {
    newInstance(initialValues?: IPolyDataNormalsInitialValues): vtkPolyDataNormals;
  };
  export default vtkPolyDataNormals;
}
