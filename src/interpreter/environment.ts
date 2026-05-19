import { NilValue } from "./nilValue";

// ============================================================
// Environment
// Manages lexical scope and variable bindings.
// ============================================================

export type LiminalValue = number | string | boolean | NilValue | LiminalValue[] | LiminalFunction | null;

export interface LiminalFunction {
  kind: "function";
  name: string | null;
  params: string[];
  body: unknown[];   // ASTNode[] — typed loosely to avoid circular import
  closure: Environment;
}

export class Environment {
  private bindings = new Map<string, LiminalValue>();
  private initialized = new Set<string>();
  private parent: Environment | null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  define(name: string, value: LiminalValue, isInitialized = true): void {
    this.bindings.set(name, value);
    if (isInitialized) this.initialized.add(name);
  }

  assign(name: string, value: LiminalValue): void {
    if (this.bindings.has(name)) {
      this.bindings.set(name, value);
      this.initialized.add(name);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new Error(`Undefined variable: ${name}`);
  }

  get(name: string): LiminalValue {
    if (this.bindings.has(name)) {
      if (!this.initialized.has(name)) {
        throw new Error(`Variable '${name}' used before initialization`);
      }
      return this.bindings.get(name)!;
    }
    if (this.parent) return this.parent.get(name);
    throw new Error(`Undefined variable: ${name}`);
  }

  isInitialized(name: string): boolean {
    if (this.bindings.has(name)) return this.initialized.has(name);
    if (this.parent) return this.parent.isInitialized(name);
    return false;
  }

  extend(): Environment {
    return new Environment(this);
  }
}