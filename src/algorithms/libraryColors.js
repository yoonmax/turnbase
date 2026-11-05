// CFOP is taught with the cross on the bottom and the last layer on top, so library
// views show the cube turned by z2 from the engine's white-on-top default: yellow on
// top, white underneath, green still in front. This changes only the paint. The logical
// state, and every move's meaning, stay exactly the same.

export function libraryColors(scheme) {
  return { U: scheme.D, D: scheme.U, R: scheme.L, L: scheme.R, F: scheme.F, B: scheme.B };
}
