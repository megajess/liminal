import { Environment, LiminalValue, LiminalMap, LiminalTuple, BuiltinFunction, isLiminalMap, isLiminalTuple } from "./environment";
import { NilValue, isNil } from "./nilValue";

function nilIfAny(args: LiminalValue[]): NilValue | null {
  for (const a of args) if (isNil(a)) return a;
  return null;
}

function nums(args: LiminalValue[], name: string): number[] {
  return args.map((a, i) => {
    if (typeof a !== "number") {
      throw new Error(`${name}: argument ${i + 1} must be a number, got ${typeof a}`);
    }
    return a;
  });
}

function valueToString(v: LiminalValue): string {
  if (v === null || isNil(v)) return "nil";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `(list ${v.map(valueToString).join(" ")})`;
  if (isLiminalTuple(v)) return `(tuple ${v.elements.map(valueToString).join(" ")})`;
  if (v instanceof Map) {
    const parts = [...v.entries()].map(([k, val]) => `:${k} ${valueToString(val)}`);
    return `(dict ${parts.join(" ")})`;
  }
  if (typeof v === "function") return "<builtin>";
  if (typeof v === "object" && "kind" in v) {
    if ((v as { kind: string }).kind === "function") {
      return `<func ${(v as { name: string | null }).name ?? "anonymous"}>`;
    }
    if ((v as { kind: string }).kind === "interop") return "<interop>";
  }
  return String(v);
}

const BUILTINS: Record<string, BuiltinFunction> = {

  // --- Arithmetic ---

  "+": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    return nums(args, "+").reduce((a, b) => a + b, 0);
  },

  "-": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const ns = nums(args, "-");
    if (ns.length === 0) throw new Error("-: requires at least 1 argument");
    if (ns.length === 1) return -ns[0];
    return ns.slice(1).reduce((a, b) => a - b, ns[0]);
  },

  "*": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    return nums(args, "*").reduce((a, b) => a * b, 1);
  },

  "/": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const ns = nums(args, "/");
    if (ns.length < 2) throw new Error("/: requires at least 2 arguments");
    return ns.slice(1).reduce((a, b) => {
      if (b === 0) throw new Error("/: division by zero");
      return a / b;
    }, ns[0]);
  },

  "mod": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error("mod: requires exactly 2 arguments");
    const [a, b] = nums(args, "mod");
    if (b === 0) throw new Error("mod: division by zero");
    return a % b;
  },

  // --- Comparison ---

  "eq": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error("eq: requires 2 arguments");
    return args[0] === args[1];
  },

  "<": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error("<: requires 2 arguments");
    const [a, b] = nums(args, "<"); return a < b;
  },

  ">": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error(">: requires 2 arguments");
    const [a, b] = nums(args, ">"); return a > b;
  },

  "<=": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error("<=: requires 2 arguments");
    const [a, b] = nums(args, "<="); return a <= b;
  },

  ">=": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    if (args.length !== 2) throw new Error(">=: requires 2 arguments");
    const [a, b] = nums(args, ">="); return a >= b;
  },

  "not": (...args) => {
    if (args.length !== 1) throw new Error("not: requires 1 argument");
    const n = nilIfAny(args); if (n) return n;
    return !args[0];
  },

  // --- Strings ---

  "str": (...args) => args.map(valueToString).join(""),

  // --- I/O ---

  "log": (...args) => {
    console.log(...args.map(valueToString));
    return new NilValue({ symbol: "log", line: 0, column: 0 });
  },

  // --- Collections ---

  "list": (...args) => args,

  "map": (...args) => {
    if (args.length % 2 !== 0) {
      throw new Error("map: requires an even number of arguments (key-value pairs)");
    }
    const m: LiminalMap = new Map();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      if (typeof key !== "string") throw new Error("map: keys must be keyword strings");
      m.set(key.startsWith(":") ? key.slice(1) : key, args[i + 1]);
    }
    return m;
  },

  // dict is the canonical dict constructor (map is kept as a legacy alias)
  "dict": (...args) => {
    if (args.length % 2 !== 0) {
      throw new Error("dict: requires an even number of arguments (keyword-value pairs)");
    }
    const m: LiminalMap = new Map();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      if (typeof key !== "string") throw new Error("dict: keys must be keyword strings");
      m.set(key.startsWith(":") ? key.slice(1) : key, args[i + 1]);
    }
    return m;
  },

  // tuple builtin — fallback for dynamic usage; (tuple ...) in source is parsed as Tuple AST node
  "tuple": (...args): LiminalTuple => ({ kind: "tuple", elements: args }),

  // --- Math ---

  "sqrt": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const [x] = nums(args, "sqrt"); return Math.sqrt(x);
  },

  "abs": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const [x] = nums(args, "abs"); return Math.abs(x);
  },

  "floor": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const [x] = nums(args, "floor"); return Math.floor(x);
  },

  "ceil": (...args) => {
    const n = nilIfAny(args); if (n) return n;
    const [x] = nums(args, "ceil"); return Math.ceil(x);
  },

  // --- Type predicates ---

  "nil?": (...args) => {
    if (args.length !== 1) throw new Error("nil?: requires 1 argument");
    return isNil(args[0]) || args[0] === null;
  },

  "number?": (...args) => {
    if (args.length !== 1) throw new Error("number?: requires 1 argument");
    return typeof args[0] === "number";
  },

  "string?": (...args) => {
    if (args.length !== 1) throw new Error("string?: requires 1 argument");
    return typeof args[0] === "string";
  },

  "bool?": (...args) => {
    if (args.length !== 1) throw new Error("bool?: requires 1 argument");
    return typeof args[0] === "boolean";
  },

  "list?": (...args) => {
    if (args.length !== 1) throw new Error("list?: requires 1 argument");
    return Array.isArray(args[0]);
  },

  "dict?": (...args) => {
    if (args.length !== 1) throw new Error("dict?: requires 1 argument");
    return isLiminalMap(args[0]);
  },

  "tuple?": (...args) => {
    if (args.length !== 1) throw new Error("tuple?: requires 1 argument");
    return isLiminalTuple(args[0]);
  },
};

export function registerBuiltins(env: Environment): void {
  for (const [name, fn] of Object.entries(BUILTINS)) {
    env.define(name, fn);
  }
}
