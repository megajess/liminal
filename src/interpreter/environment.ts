import type { ASTNode, FuncParam } from "../ast/types";
import { NilValue } from "./nilValue";

// ============================================================
// Runtime value types
// ============================================================

export type LiminalMap = Map<string, LiminalValue>;

export interface InteropValue {
  kind: "interop";
  value: unknown;
}

export interface LiminalTuple {
  kind: "tuple";
  elements: LiminalValue[];
}

export interface LiminalFunction {
  kind: "function";
  name: string | null;
  params: FuncParam[];
  body: ASTNode[];
  closure: Environment;
  async: boolean;
}

export type BuiltinFunction = (...args: LiminalValue[]) => LiminalValue;

export type LiminalValue =
  | number
  | string
  | boolean
  | NilValue
  | LiminalValue[]
  | LiminalFunction
  | BuiltinFunction
  | LiminalMap
  | LiminalTuple
  | InteropValue
  | null;

export function isLiminalMap(v: LiminalValue): v is LiminalMap {
  return v instanceof Map;
}

export function isLiminalTuple(v: LiminalValue): v is LiminalTuple {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Map) &&
    !(v instanceof NilValue) &&
    "kind" in (v as object) &&
    (v as LiminalTuple).kind === "tuple"
  );
}

export function isInteropValue(v: LiminalValue): v is InteropValue {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Map) &&
    !(v instanceof NilValue) &&
    "kind" in (v as object) &&
    (v as InteropValue).kind === "interop"
  );
}

export function isLiminalFunction(v: LiminalValue): v is LiminalFunction {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Map) &&
    !(v instanceof NilValue) &&
    "kind" in (v as object) &&
    (v as LiminalFunction).kind === "function"
  );
}

export function isBuiltinFunction(v: LiminalValue): v is BuiltinFunction {
  return typeof v === "function";
}

// ============================================================
// Environment — manages lexical scope and variable bindings
// ============================================================

export class Environment {
  private bindings = new Map<string, LiminalValue>();
  private initialized = new Set<string>();
  private consts = new Set<string>();
  private parent: Environment | null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  // Define a var binding (mutable)
  define(name: string, value: LiminalValue, isInitialized = true): void {
    this.bindings.set(name, value);
    if (isInitialized) this.initialized.add(name);
  }

  // Define a const binding (immutable — set throws, mutate bypasses)
  defineConst(name: string, value: LiminalValue): void {
    this.bindings.set(name, value);
    this.initialized.add(name);
    this.consts.add(name);
  }

  // Reassign a var binding — throws on const
  assign(name: string, value: LiminalValue): void {
    if (this.bindings.has(name)) {
      if (this.consts.has(name)) {
        throw new Error(`Cannot reassign const '${name}' — use mutate in the REPL to force`);
      }
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

  // Force-reassign any binding regardless of const — REPL only
  mutate(name: string, value: LiminalValue): void {
    if (this.bindings.has(name)) {
      this.bindings.set(name, value);
      this.initialized.add(name);
      return;
    }
    if (this.parent) {
      this.parent.mutate(name, value);
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
