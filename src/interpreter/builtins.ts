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

export function valueToString(v: LiminalValue): string {
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

  // string is the canonical variadic concat + coercion function.
  // (string 42) => "42"; (string "a " "b") => "a b"; nil renders as "nil".
  "string": (...args) => args.map(valueToString).join(""),

  // --- I/O ---

  "log": (...args) => {
    console.log(...args.map(valueToString));
    return new NilValue({ symbol: "log", line: 0, column: 0 });
  },

  // printf-style formatter. Specifiers: %s %d %f %.Nf %e %b %o %x %X %%.
  // Width and alignment follow printf: %10s right-aligns, %-10s left-aligns, %010d zero-pads.
  // Nil arguments render as "nil" regardless of specifier.
  "fmt": (...args) => {
    if (args.length === 0) throw new Error("fmt: requires at least a template");
    const template = args[0];
    if (typeof template !== "string") {
      throw new Error(`fmt: first argument must be a string, got ${typeof template}`);
    }
    const values = args.slice(1);
    let out = "";
    let i = 0;
    let argIdx = 0;
    while (i < template.length) {
      if (template[i] !== "%") { out += template[i++]; continue; }
      let j = i + 1;
      let flags = "";
      while (j < template.length && "-+0 #".includes(template[j])) { flags += template[j]; j++; }
      let widthStr = "";
      while (j < template.length && template[j] >= "0" && template[j] <= "9") { widthStr += template[j]; j++; }
      let precisionStr = "";
      if (template[j] === ".") {
        j++;
        while (j < template.length && template[j] >= "0" && template[j] <= "9") { precisionStr += template[j]; j++; }
      }
      const spec = template[j];
      i = j + 1;
      if (spec === "%") { out += "%"; continue; }
      if (spec === undefined) throw new Error("fmt: incomplete format specifier at end of template");
      const arg = values[argIdx++];
      let s: string;
      if (arg === null || isNil(arg)) {
        s = "nil";
      } else {
        switch (spec) {
          case "s": s = valueToString(arg); break;
          case "d": {
            if (typeof arg !== "number") throw new Error(`fmt: %d expects a number, got ${typeof arg}`);
            s = String(Math.trunc(arg));
            break;
          }
          case "f": {
            if (typeof arg !== "number") throw new Error(`fmt: %f expects a number, got ${typeof arg}`);
            s = precisionStr === "" ? String(arg) : arg.toFixed(parseInt(precisionStr, 10));
            break;
          }
          case "e": {
            if (typeof arg !== "number") throw new Error(`fmt: %e expects a number, got ${typeof arg}`);
            s = precisionStr === "" ? arg.toExponential() : arg.toExponential(parseInt(precisionStr, 10));
            break;
          }
          case "b": s = arg ? "true" : "false"; break;
          case "o": {
            if (typeof arg !== "number") throw new Error(`fmt: %o expects a number, got ${typeof arg}`);
            s = Math.trunc(arg).toString(8);
            break;
          }
          case "x": {
            if (typeof arg !== "number") throw new Error(`fmt: %x expects a number, got ${typeof arg}`);
            s = Math.trunc(arg).toString(16);
            break;
          }
          case "X": {
            if (typeof arg !== "number") throw new Error(`fmt: %X expects a number, got ${typeof arg}`);
            s = Math.trunc(arg).toString(16).toUpperCase();
            break;
          }
          default: throw new Error(`fmt: unknown format specifier '%${spec}'`);
        }
      }
      if (widthStr !== "") {
        const width = parseInt(widthStr, 10);
        if (s.length < width) {
          const leftAlign = flags.includes("-");
          const zeroPad = flags.includes("0") && !leftAlign && "dfoxX".includes(spec);
          const pad = (zeroPad ? "0" : " ").repeat(width - s.length);
          s = leftAlign ? s + pad : pad + s;
        }
      }
      out += s;
    }
    return out;
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

  // --- Type conversion ---
  // Per doc §"Type Constructors / Converters": conversions return nil on parse failure,
  // never throw. Nil in → nil out (propagated). `string` and `bool` always succeed.

  "int": (...args) => {
    if (args.length !== 1) throw new Error("int: requires 1 argument");
    const n = nilIfAny(args); if (n) return n;
    const v = args[0];
    if (typeof v === "number") return Math.trunc(v);
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const t = v.trim();
      if (!/^[-+]?\d+$/.test(t)) return null;
      const parsed = parseInt(t, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  },

  "float": (...args) => {
    if (args.length !== 1) throw new Error("float: requires 1 argument");
    const n = nilIfAny(args); if (n) return n;
    const v = args[0];
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const t = v.trim();
      if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
      const parsed = parseFloat(t);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  },

  // bool: truthiness coercion. Only falsy values: false, nil, empty collections.
  // 0, "", 0.0 are all truthy (stricter than JS).
  "bool": (...args) => {
    if (args.length !== 1) throw new Error("bool: requires 1 argument");
    const v = args[0];
    if (v === false) return false;
    if (v === null || isNil(v)) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (v instanceof Map && v.size === 0) return false;
    if (isLiminalTuple(v) && v.elements.length === 0) return false;
    return true;
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
