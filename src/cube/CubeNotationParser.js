// Recursive-descent parser for cube notation.
//
//   sequence := item*
//   item     := atom suffix?
//   atom     := move | '(' sequence ')' | '[' sequence ',' sequence ']'
//                                       | '[' sequence ':' sequence ']'
//   suffix   := integer? prime?  (also prime before integer)
//
// A commutator [A, B] expands to A B A' B' and a conjugate [A: B] to A B A'.
// `// line` and `/* block */` comments are ignored. Anything that could be read
// in more than one way is an error rather than a guess.

import { invertMoves, makeMove, movesToString, normalizeAmount } from './CubeMoves.js';

const PRIMES = new Set(["'", '’', '‘', '′', 'ʼ', '`', '´']);
const FACE_LETTERS = new Set(['U', 'D', 'R', 'L', 'F', 'B']);
const LOWER_WIDE = new Set(['u', 'd', 'r', 'l', 'f', 'b']);
const SLICE_LETTERS = new Set(['M', 'E', 'S']);
const ROTATION_LETTERS = new Set(['x', 'y', 'z']);

export class NotationError extends Error {
  constructor(message, index, length = 1) {
    super(message);
    this.name = 'NotationError';
    this.index = index;
    this.length = length;
  }
}

class Parser {
  constructor(source, n) {
    this.source = source;
    this.n = n;
    this.i = 0;
  }

  peek() {
    return this.source[this.i];
  }

  skipTrivia() {
    for (;;) {
      const c = this.peek();
      if (c === undefined) return;
      if (/\s/.test(c)) {
        this.i += 1;
      } else if (c === '/' && this.source[this.i + 1] === '/') {
        while (this.peek() !== undefined && this.peek() !== '\n') this.i += 1;
      } else if (c === '/' && this.source[this.i + 1] === '*') {
        const end = this.source.indexOf('*/', this.i + 2);
        if (end < 0) throw new NotationError('This comment is never closed. Add */ to end it.', this.i, 2);
        this.i = end + 2;
      } else {
        return;
      }
    }
  }

  // Reads items until one of the stop characters, or the end of input.
  sequence(stops) {
    const nodes = [];
    for (;;) {
      this.skipTrivia();
      const c = this.peek();
      if (c === undefined || stops.has(c)) return nodes;
      nodes.push(this.item());
    }
  }

  item() {
    const start = this.i;
    const atom = this.atom();
    const { repeat, inverted, end } = this.suffix();
    if (atom.type === 'move') {
      const signed = (inverted ? -1 : 1) * repeat;
      const amount = normalizeAmount(signed * atom.base);
      return { type: 'move', amount, spec: atom.spec, start, end };
    }
    return { type: 'repeat', node: atom, repeat, inverted, start, end };
  }

  atom() {
    const c = this.peek();
    if (c === '(') return this.group();
    if (c === '[') return this.bracket();
    if (c === ')' || c === ']') {
      throw new NotationError(`There is a "${c}" with nothing opening it.`, this.i);
    }
    if (c === ',' || c === ':') {
      throw new NotationError(`"${c}" only belongs inside square brackets, as in [R, U] or [R: U].`, this.i);
    }
    if (PRIMES.has(c)) throw new NotationError('A prime needs a move or group in front of it.', this.i);
    return this.move();
  }

  group() {
    const open = this.i;
    this.i += 1;
    const body = this.sequence(new Set([')', ']', ',', ':']));
    if (this.peek() !== ')') {
      throw new NotationError('This parenthesis is never closed.', open);
    }
    this.i += 1;
    return { type: 'group', body };
  }

  bracket() {
    const open = this.i;
    this.i += 1;
    const a = this.sequence(new Set([',', ':', ']', ')']));
    const sep = this.peek();
    if (sep === ']') {
      throw new NotationError('Square brackets hold a commutator [A, B] or a conjugate [A: B]. Use parentheses for a plain group.', open);
    }
    if (sep !== ',' && sep !== ':') throw new NotationError('This bracket is never closed.', open);
    this.i += 1;
    const b = this.sequence(new Set([',', ':', ']', ')']));
    if (this.peek() !== ']') throw new NotationError('This bracket is never closed.', open);
    this.i += 1;
    return { type: sep === ',' ? 'commutator' : 'conjugate', a, b };
  }

  move() {
    const start = this.i;
    let inner = null;
    let outer = null;
    const prefix = /^(\d+)(?:-(\d+))?/.exec(this.source.slice(this.i));
    if (prefix) {
      this.i += prefix[0].length;
      if (prefix[2] !== undefined) {
        inner = Number(prefix[1]);
        outer = Number(prefix[2]);
      } else {
        outer = Number(prefix[1]);
      }
    }
    const letter = this.peek();
    if (letter === undefined || !/[A-Za-z]/.test(letter)) {
      if (prefix) {
        throw new NotationError(`"${prefix[0]}" needs a move right after it, as in ${prefix[0]}Rw.`, start, prefix[0].length);
      }
      throw new NotationError(`"${letter}" is not part of cube notation.`, this.i);
    }
    this.i += 1;
    const wideMark = this.peek() === 'w';
    if (wideMark) this.i += 1;
    const length = this.i - start;
    const spec = this.classify(letter, wideMark, inner, outer, start, length);
    return { type: 'move', spec, base: 1 };
  }

  classify(letter, wideMark, innerRaw, outerRaw, start, length) {
    const { n } = this;
    const hasPrefix = outerRaw !== null;
    if (ROTATION_LETTERS.has(letter) || SLICE_LETTERS.has(letter)) {
      if (hasPrefix || wideMark) {
        throw new NotationError(`"${letter}" cannot take a layer number or a w.`, start, length);
      }
      if (SLICE_LETTERS.has(letter)) {
        if (n % 2 === 0) {
          throw new NotationError(`${letter} has no single middle layer on a ${n}×${n}.`, start, length);
        }
        return { kind: 'slice', family: letter };
      }
      return { kind: 'rotation', family: letter };
    }
    if (LOWER_WIDE.has(letter)) {
      const family = letter.toUpperCase();
      if (wideMark || hasPrefix) {
        throw new NotationError(`Write this as ${family}w or as ${letter}, not both.`, start, length);
      }
      if (n !== 3) {
        throw new NotationError(`Lowercase "${letter}" is ambiguous on a ${n}×${n}. Write ${family}w, or a layer number.`, start, length);
      }
      return { kind: 'wide', family, inner: 1, outer: 2, notation: 'lower' };
    }
    if (FACE_LETTERS.has(letter)) {
      if (wideMark) {
        const inner = innerRaw ?? 1;
        const outer = outerRaw ?? 2;
        this.checkLayers(letter, inner, outer, start, length);
        return { kind: 'wide', family: letter, inner, outer };
      }
      if (innerRaw !== null) {
        throw new NotationError(`A layer range needs a w: ${innerRaw}-${outerRaw}${letter}w.`, start, length);
      }
      if (outerRaw !== null) {
        this.checkLayers(letter, outerRaw, outerRaw, start, length);
        return { kind: 'face', family: letter, inner: outerRaw, outer: outerRaw };
      }
      return { kind: 'face', family: letter, inner: 1, outer: 1 };
    }
    if (letter === 'm' || letter === 'e' || letter === 's') {
      throw new NotationError(`Lowercase "${letter}" is ambiguous. Use ${letter.toUpperCase()} for the slice.`, start, length);
    }
    if (letter === 'X' || letter === 'Y' || letter === 'Z') {
      throw new NotationError(`Whole-cube rotations are lowercase. Did you mean ${letter.toLowerCase()}?`, start, length);
    }
    throw new NotationError(`"${letter}" is not a move.`, start, length);
  }

  checkLayers(letter, inner, outer, start, length) {
    const { n } = this;
    if (inner < 1 || outer < inner) {
      throw new NotationError(`That layer range on ${letter} is backwards or empty.`, start, length);
    }
    if (outer >= n) {
      throw new NotationError(
        n === 2
          ? `A ${n}×${n} has no inner layers for ${letter} to take.`
          : `A ${n}×${n} move can reach at most ${n - 1} layers. For the whole cube use x, y or z.`,
        start,
        length,
      );
    }
  }

  suffix() {
    let repeat = 1;
    let inverted = false;
    let seenDigits = false;
    const readPrime = () => {
      if (PRIMES.has(this.peek())) {
        this.i += 1;
        if (PRIMES.has(this.peek())) {
          throw new NotationError('A double prime is not valid notation.', this.i);
        }
        inverted = true;
      }
    };
    readPrime();
    const digits = /^\d+/.exec(this.source.slice(this.i));
    if (digits) {
      // A digit that opens the next token, as in "R2 3Rw" written "R3Rw", would
      // be ambiguous, so a suffix may not run straight into a letter.
      const after = this.source[this.i + digits[0].length];
      const next = this.source.slice(this.i + digits[0].length, this.i + digits[0].length + 2);
      if (after !== undefined && /[A-Za-z]/.test(after) && /^[A-Za-z]w/.test(next)) {
        throw new NotationError('Put a space between this number and the wide move after it.', this.i, digits[0].length);
      }
      repeat = Number(digits[0]);
      if (repeat === 0) throw new NotationError('A repeat count of 0 does nothing. Remove it.', this.i, digits[0].length);
      if (repeat > 999) throw new NotationError('That repeat count is too large.', this.i, digits[0].length);
      this.i += digits[0].length;
      seenDigits = true;
    }
    if (!inverted && seenDigits) readPrime();
    return { repeat, inverted, end: this.i };
  }
}

function expand(nodes, out = []) {
  for (const node of nodes) expandNode(node, out);
  return out;
}

function expandNode(node, out) {
  switch (node.type) {
    case 'move': {
      if (node.amount !== 0) {
        out.push(makeMove(node.spec.kind, node.spec.family, node.amount, node.spec));
      }
      return;
    }
    case 'group':
      expand(node.body, out);
      return;
    case 'commutator': {
      const a = expand(node.a);
      const b = expand(node.b);
      out.push(...a, ...b, ...invertMoves(a), ...invertMoves(b));
      return;
    }
    case 'conjugate': {
      const a = expand(node.a);
      const b = expand(node.b);
      out.push(...a, ...b, ...invertMoves(a));
      return;
    }
    case 'repeat': {
      const inner = [];
      expandNode(node.node, inner);
      const unit = node.inverted ? invertMoves(inner) : inner;
      if (node.repeat * unit.length > 20000) {
        throw new NotationError('This expands to too many moves.', node.start, node.end - node.start);
      }
      for (let k = 0; k < node.repeat; k += 1) out.push(...unit);
      return;
    }
    default:
      throw new Error(`Unknown node type ${node.type}`);
  }
}

/**
 * Parses notation. Never throws on bad input.
 * Returns { ok: true, moves, normalized } or { ok: false, error: { message, index, length } }.
 */
export function parseAlgorithm(source, { n = 3 } = {}) {
  const parser = new Parser(source ?? '', n);
  try {
    const nodes = parser.sequence(new Set());
    const moves = expand(nodes);
    return { ok: true, moves, normalized: movesToString(moves) };
  } catch (error) {
    if (error instanceof NotationError) {
      return { ok: false, error: { message: error.message, index: error.index, length: error.length } };
    }
    throw error;
  }
}

/** For trusted data: throws with the offending text if it does not parse. */
export function parseMoves(source, options) {
  const result = parseAlgorithm(source, options);
  if (!result.ok) {
    throw new Error(`Could not parse "${source}": ${result.error.message} (at ${result.error.index})`);
  }
  return result.moves;
}
