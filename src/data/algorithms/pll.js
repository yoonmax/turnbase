// All 21 PLL cases, by their standard names. Each must preserve the first two layers
// and orientation, and its `pieces` line states the permutation it performs, which
// tests/algorithms checks against the cube state. Algorithms that need a final U turn
// include it, though print often leaves it off. Each one then finishes fully solved, and
// the case state is the standard picture, so its arrows show the true swaps and cycles.

export const PLL = [
  { name: 'Aa', category: 'Corners only', pieces: 'corners:3', algs: ["x R' U R' D2 R U' R' D2 R2 x'", "l' U R' D2 R U' R' D2 R2 x'"] },
  { name: 'Ab', category: 'Corners only', pieces: 'corners:3', algs: ["x R2 D2 R U R' D2 R U' R x'", "x' R U' R D2 R' U R D2 R2 x"] },
  { name: 'E', category: 'Corners only', pieces: 'corners:2+2', algs: ["x' R U' R' D R U R' D' R U R' D R U' R' D' x"] },
  { name: 'F', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"] },
  { name: 'Ga', category: 'G perm', pieces: 'corners:3 edges:3', algs: ["R2 U R' U R' U' R U' R2 U' D R' U R D' U"] },
  { name: 'Gb', category: 'G perm', pieces: 'corners:3 edges:3', algs: ["R' U' R U D' R2 U R' U R U' R U' R2 D U'"] },
  { name: 'Gc', category: 'G perm', pieces: 'corners:3 edges:3', algs: ["R2 U' R U' R U R' U R2 U D' R U' R' D U'"] },
  { name: 'Gd', category: 'G perm', pieces: 'corners:3 edges:3', algs: ["R U R' U' D R2 U' R U' R' U R' U R2 D' U"] },
  { name: 'H', category: 'Edges only', pieces: 'edges:2+2', algs: ['M2 U M2 U2 M2 U M2'] },
  { name: 'Ja', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["x R2 F R F' R U2 r' U r U2 x'", "R' U L' U2 R U' R' U2 R L"] },
  { name: 'Jb', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["R U R' F' R U R' U' R' F R2 U' R' U'"] },
  { name: 'Na', category: 'Diagonal swap', pieces: 'corners:2 edges:2', algs: ["R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"] },
  { name: 'Nb', category: 'Diagonal swap', pieces: 'corners:2 edges:2', algs: ["R' U R U' R' F' U' F R U R' F R' F' R U' R"] },
  { name: 'Ra', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["R U' R' U' R U R D R' U' R D' R' U2 R' U'"] },
  { name: 'Rb', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["R2 F R U R U' R' F' R U2 R' U2 R U"] },
  { name: 'T', category: 'Adjacent swap', pieces: 'corners:2 edges:2', algs: ["R U R' U' R' F R2 U' R' U' R U R' F'"] },
  { name: 'Ua', category: 'Edges only', pieces: 'edges:3', algs: ["M2 U M U2 M' U M2", "R U' R U R U R U' R' U' R2"] },
  { name: 'Ub', category: 'Edges only', pieces: 'edges:3', algs: ["M2 U' M U2 M' U' M2", "R2 U R U R' U' R' U' R' U R'"] },
  { name: 'V', category: 'Diagonal swap', pieces: 'corners:2 edges:2', algs: ["R' U R' U' y R' F' R2 U' R' U R' F R F"] },
  { name: 'Y', category: 'Diagonal swap', pieces: 'corners:2 edges:2', algs: ["F R U' R' U' R U R' F' R U R' U' R' F R F'"] },
  { name: 'Z', category: 'Edges only', pieces: 'edges:2+2', algs: ["M' U M2 U M2 U M' U2 M2 U'"] },
];
