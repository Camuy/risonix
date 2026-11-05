/**
 * I profili di rendering di VTK.js espongono i mapper OpenGL come effetto
 * collaterale dell'import e non pubblicano dichiarazioni di tipo. Questa
 * dichiarazione ambientale soddisfa ``noUncheckedSideEffectImports`` per
 * l'import del profilo Geometria usato dalla scena 3D (P3-03).
 */
declare module '@kitware/vtk.js/Rendering/Profiles/Geometry';
