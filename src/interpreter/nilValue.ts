// ============================================================
// Runtime NilValue
// Used by the interpreter (REPL/Node mode).
// Carries a breadcrumb trace of where nil originated and
// how it propagated. Stripped in compiled output.
// ============================================================

export interface NilTraceEntry {
  symbol: string;
  line: number;
  column: number;
}

export class NilValue {
  readonly trace: NilTraceEntry[];

  constructor(origin: NilTraceEntry, propagatedThrough: NilTraceEntry[] = []) {
    this.trace = [origin, ...propagatedThrough];
  }

  propagate(through: NilTraceEntry): NilValue {
    return new NilValue(this.trace[0], [...this.trace.slice(1), through]);
  }

  formatTrace(): string {
    return this.trace
      .map((t, i) =>
        i === 0
          ? `nil originated at '${t.symbol}' (${t.line}:${t.column})`
          : `  propagated through '${t.symbol}' (${t.line}:${t.column})`
      )
      .join("\n");
  }

  toString(): string {
    return "nil";
  }
}

export function isNil(value: unknown): value is NilValue {
  return value instanceof NilValue;
}