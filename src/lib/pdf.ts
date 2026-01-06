type MatrixLike = {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
};

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixLike | number[]) {
    if (!init) return;

    if (Array.isArray(init)) {
      const [a, b, c, d, e, f] = init;
      if (typeof a === 'number') this.a = a;
      if (typeof b === 'number') this.b = b;
      if (typeof c === 'number') this.c = c;
      if (typeof d === 'number') this.d = d;
      if (typeof e === 'number') this.e = e;
      if (typeof f === 'number') this.f = f;
      return;
    }

    if (typeof init === 'object') {
      if (typeof init.a === 'number') this.a = init.a;
      if (typeof init.b === 'number') this.b = init.b;
      if (typeof init.c === 'number') this.c = init.c;
      if (typeof init.d === 'number') this.d = init.d;
      if (typeof init.e === 'number') this.e = init.e;
      if (typeof init.f === 'number') this.f = init.f;
    }
  }

  multiplySelf(other: MatrixLike | number[]): this {
    const o = new DOMMatrixPolyfill(other);
    const a = this.a * o.a + this.c * o.b;
    const b = this.b * o.a + this.d * o.b;
    const c = this.a * o.c + this.c * o.d;
    const d = this.b * o.c + this.d * o.d;
    const e = this.a * o.e + this.c * o.f + this.e;
    const f = this.b * o.e + this.d * o.f + this.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  preMultiplySelf(other: MatrixLike | number[]): this {
    const o = new DOMMatrixPolyfill(other);
    const a = o.a * this.a + o.c * this.b;
    const b = o.b * this.a + o.d * this.b;
    const c = o.a * this.c + o.c * this.d;
    const d = o.b * this.c + o.d * this.d;
    const e = o.a * this.e + o.c * this.f + o.e;
    const f = o.b * this.e + o.d * this.f + o.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (!Number.isFinite(det) || det === 0) return this;

    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = (this.c * this.f - this.d * this.e) / det;
    const f = (this.b * this.e - this.a * this.f) / det;

    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    const out = new DOMMatrixPolyfill(this);
    out.e = out.a * tx + out.c * ty + out.e;
    out.f = out.b * tx + out.d * ty + out.f;
    return out;
  }

  scale(scaleX = 1, scaleY?: number): DOMMatrixPolyfill {
    const sy = typeof scaleY === 'number' ? scaleY : scaleX;
    const out = new DOMMatrixPolyfill(this);
    out.a *= scaleX;
    out.b *= scaleX;
    out.c *= sy;
    out.d *= sy;
    return out;
  }
}

export function ensurePdfJsDomMatrix() {
  const globalAny = globalThis as unknown as { DOMMatrix?: unknown };
  if (typeof globalAny.DOMMatrix === 'function') return;
  globalAny.DOMMatrix = DOMMatrixPolyfill;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  ensurePdfJsDomMatrix();

  const { PDFParse } = await import('pdf-parse');
  if (!PDFParse) throw new Error('pdf-parse: PDFParse export not found');

  const parser = new PDFParse({ data: buffer });
  try {
    const result = (await parser.getText()) as unknown;
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (
      typeof result === 'object' &&
      result !== null &&
      'text' in result &&
      typeof (result as { text?: unknown }).text === 'string'
    ) {
      return (result as { text: string }).text;
    }
    return String(result);
  } finally {
    if (typeof parser.destroy === 'function') {
      await parser.destroy();
    }
  }
}

