import { ASTNode, FuncParam } from "../ast/types";
import {
  Environment,
  LiminalValue,
  LiminalFunction,
  LiminalMap,
  LiminalTuple,
  InteropValue,
  isLiminalMap,
  isLiminalTuple,
  isInteropValue,
  isLiminalFunction,
  isBuiltinFunction,
} from "./environment";
import { NilValue, isNil } from "./nilValue";
import { registerBuiltins } from "./builtins";

export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(line !== undefined ? `${line}:${column} — ${message}` : message);
    this.name = "RuntimeError";
  }
}

// Thrown inside a ? non-nil branch when nil is encountered — caught by NilUnwrapBlock
class NilSignal {
  constructor(public readonly nil: NilValue) {}
}

// Thrown by (throw expr) — carries the original Liminal value through try/catch
class LiminalThrowable extends Error {
  constructor(
    public readonly liminalValue: LiminalValue,
    message: string
  ) {
    super(message);
    this.name = "LiminalThrowable";
  }
}

export class Interpreter {
  readonly globalEnv: Environment;

  constructor(env?: Environment) {
    this.globalEnv = env ?? new Environment();
    registerBuiltins(this.globalEnv);
  }

  run(program: ASTNode): LiminalValue {
    if (program.type !== "Program") throw new RuntimeError("Expected Program node");
    return this.evalBody((program as { body: ASTNode[] }).body, this.globalEnv);
  }

  eval(node: ASTNode, env: Environment): LiminalValue {
    switch (node.type) {

      case "Program":
        return this.evalBody(node.body, env);

      case "NumberLiteral":
        return node.value;

      case "StringLiteral":
        return node.value;

      case "BooleanLiteral":
        return node.value;

      case "NilLiteral":
        return new NilValue(
          node.loc
            ? { symbol: "nil", line: node.loc.line, column: node.loc.column }
            : { symbol: "nil", line: 0, column: 0 }
        );

      case "Symbol": {
        // Keyword atoms (":name") are self-quoting — they evaluate to themselves
        if (node.name.startsWith(":")) return node.name;
        return env.get(node.name);
      }

      case "InterpolatedString": {
        let result = "";
        for (const seg of node.segments) {
          if (seg.kind === "literal") {
            result += seg.value;
          } else {
            result += this.valueToString(this.eval(seg.expr, env));
          }
        }
        return result;
      }

      case "List":
        return node.elements.map(el => this.eval(el, env));

      case "Dict": {
        const m: LiminalMap = new Map();
        for (const { key, value } of node.entries) {
          m.set(key, this.eval(value, env));
        }
        return m;
      }

      case "Tuple": {
        const elements = node.elements.map(el => this.eval(el, env));
        return { kind: "tuple", elements } as LiminalTuple;
      }

      case "ThrowExpression": {
        const val = this.eval(node.value, env);
        throw new LiminalThrowable(val, this.valueToString(val));
      }

      case "ConstDeclaration": {
        const val = this.eval(node.value, env);
        env.defineConst(node.name, val);
        return val;
      }

      case "VarDeclaration": {
        const val = node.value !== null ? this.eval(node.value, env) : null;
        env.define(node.name, val, node.initialized);
        return val;
      }

      case "SetExpression": {
        const val = this.eval(node.value, env);
        env.assign(node.name, val);
        return val;
      }

      case "MutateExpression": {
        const val = this.eval(node.value, env);
        env.mutate(node.name, val);
        return val;
      }

      case "LocalBinding": {
        const localEnv = env.extend();
        for (const [name, expr] of node.bindings) {
          localEnv.define(name, this.eval(expr, localEnv));
        }
        return this.evalBody(node.body, localEnv);
      }

      case "FuncDeclaration": {
        const fn: LiminalFunction = {
          kind: "function",
          name: node.name,
          params: node.params,
          body: node.body,
          closure: env,
          async: node.async,
        };
        if (node.name) env.define(node.name, fn);
        return fn;
      }

      case "CallExpression": {
        const callee = this.eval(node.callee, env);
        const args = node.args.map(a => this.eval(a, env));
        const loc = node.loc ?? { line: 0, column: 0 };

        if (isNil(callee)) return this.nilAt(callee, loc);

        if (isLiminalFunction(callee)) {
          // Nil propagation: non-optional positional arg is nil → propagate without calling
          const nilArg = this.firstNilPositionalArg(args, callee.params);
          if (nilArg) return this.nilAt(nilArg, loc);
          return this.applyFunction(callee, args, loc, env);
        }

        if (isBuiltinFunction(callee)) {
          return callee(...args);
        }

        if (isInteropValue(callee)) {
          return this.callInterop(callee, args, loc);
        }

        throw new RuntimeError(
          `Cannot call non-function: ${this.valueToString(callee)}`,
          loc.line, loc.column
        );
      }

      case "MemberAccess": {
        const obj = this.eval(node.object, env);
        return this.memberAccess(obj, node.member, node.loc ?? { line: 0, column: 0 });
      }

      case "IfExpression": {
        const cond = this.eval(node.condition, env);
        if (isNil(cond)) return cond;
        if (cond) return this.eval(node.consequent, env);
        if (node.alternate) return this.eval(node.alternate, env);
        return null;
      }

      case "CondExpression": {
        for (const clause of node.clauses) {
          const test = this.eval(clause.condition, env);
          if (isNil(test)) return test;
          if (test) return this.eval(clause.result, env);
        }
        return node.else ? this.eval(node.else, env) : null;
      }

      case "DoBlock":
        return this.evalBody(node.body, env);

      case "ImportDeclaration":
        // Module system is Phase 4 — JS/npm imports are resolved at call sites via %
        return null;

      case "TryCatch": {
        try {
          return this.evalBody(node.body, env);
        } catch (e) {
          if (e instanceof NilSignal) throw e; // nil signals pass through try/catch
          const catchEnv = env.extend();
          if (node.catchBinding) {
            catchEnv.define(node.catchBinding, this.wrapError(e));
          }
          return this.evalBody(node.catchBody, catchEnv);
        } finally {
          if (node.finallyBody) this.evalBody(node.finallyBody, env);
        }
      }

      case "AwaitExpression":
        // Interpreter mode is synchronous — await is a no-op; Promise values pass through as InteropValues
        return this.eval(node.expression, env);

      case "NilCoalesce": {
        const val = this.eval(node.expression, env);
        return isNil(val) ? this.eval(node.default, env) : val;
      }

      case "NilUnwrapBlock": {
        try {
          const branchEnv = env.extend();
          let last: LiminalValue = null;
          for (const expr of node.nonNilBranch) {
            last = this.eval(expr, branchEnv);
            if (isNil(last)) throw new NilSignal(last);
          }
          return last;
        } catch (e) {
          if (!(e instanceof NilSignal)) throw e;
          if (node.nilBranch === null) return e.nil;
          return this.evalBody(node.nilBranch, env.extend());
        }
      }

      case "InteropExpression": {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require(node.target);
          return { kind: "interop", value: mod } as InteropValue;
        } catch {
          throw new RuntimeError(`Cannot require '${node.target}' — is it installed?`);
        }
      }

      case "MacroDeclaration":
        // Macros are Phase 3 work — stub
        return null;

      case "QuasiQuote":
      case "Unquote":
      case "UnquoteSplice":
        throw new RuntimeError("Macros and quasiquoting are not yet implemented");
    }
  }

  // --- Helpers ---

  private evalBody(body: ASTNode[], env: Environment): LiminalValue {
    let result: LiminalValue = null;
    for (const node of body) result = this.eval(node, env);
    return result;
  }

  private memberAccess(
    obj: LiminalValue,
    member: string,
    loc: { line: number; column: number }
  ): LiminalValue {
    if (isNil(obj)) return obj;

    if (isLiminalMap(obj)) {
      const val = obj.get(member);
      return val !== undefined ? val : new NilValue({ symbol: member, ...loc });
    }

    if (isLiminalTuple(obj)) {
      const idx = parseInt(member, 10);
      if (!isNaN(idx)) {
        return idx >= 0 && idx < obj.elements.length
          ? obj.elements[idx]
          : new NilValue({ symbol: member, ...loc });
      }
      if (member === "length") return obj.elements.length;
      return new NilValue({ symbol: member, ...loc });
    }

    if (isInteropValue(obj)) {
      const raw = (obj.value as Record<string, unknown>)[member];
      return this.jsToLiminal(raw, loc);
    }

    if (typeof obj === "string") {
      switch (member) {
        case "length": return obj.length;
        case "upper":  return obj.toUpperCase();
        case "lower":  return obj.toLowerCase();
        case "trim":   return obj.trim();
      }
    }

    if (Array.isArray(obj)) {
      switch (member) {
        case "length": return obj.length;
        case "first":  return obj.length > 0 ? obj[0] : new NilValue({ symbol: "first", ...loc });
        case "last":   return obj.length > 0 ? obj[obj.length - 1] : new NilValue({ symbol: "last", ...loc });
      }
    }

    return new NilValue({ symbol: member, ...loc });
  }

  private applyFunction(
    fn: LiminalFunction,
    args: LiminalValue[],
    loc: { line: number; column: number },
    callerEnv: Environment
  ): LiminalValue {
    const callEnv = fn.closure.extend();
    const positional = fn.params.filter(p => p.externalName === null);
    const named = fn.params.filter(p => p.externalName !== null);

    // Positional args come first, before any keyword
    let positionalEnd = 0;
    while (positionalEnd < args.length) {
      const a = args[positionalEnd];
      if (typeof a === "string" && a.startsWith(":")) break;
      positionalEnd++;
    }

    for (let i = 0; i < positional.length; i++) {
      if (i >= positionalEnd) {
        throw new RuntimeError(
          `Missing required positional argument '${positional[i].name}'`,
          loc.line, loc.column
        );
      }
      callEnv.define(positional[i].name, args[i]);
    }

    // Keyword-value pairs for named params
    const kwArgs = new Map<string, LiminalValue>();
    for (let i = positionalEnd; i + 1 < args.length; i += 2) {
      const key = args[i];
      if (typeof key === "string" && key.startsWith(":")) {
        kwArgs.set(key.slice(1), args[i + 1]);
      }
    }

    for (const param of named) {
      const ext = param.externalName!;
      if (kwArgs.has(ext)) {
        callEnv.define(param.name, kwArgs.get(ext)!);
      } else if (param.defaultValue !== null) {
        callEnv.define(param.name, this.eval(param.defaultValue, callerEnv));
      } else if (param.typeAnnotation.optional) {
        callEnv.define(param.name, new NilValue({ symbol: param.name, ...loc }));
      } else {
        throw new RuntimeError(
          `Missing required argument ':${ext}'`,
          loc.line, loc.column
        );
      }
    }

    return this.evalBody(fn.body, callEnv);
  }

  private callInterop(
    callee: InteropValue,
    args: LiminalValue[],
    loc: { line: number; column: number }
  ): LiminalValue {
    if (typeof callee.value !== "function") {
      throw new RuntimeError(`InteropValue is not callable`, loc.line, loc.column);
    }
    const fn = callee.value as (...a: unknown[]) => unknown;
    const result = fn(...args.map(a => this.liminalToJs(a)));
    return this.jsToLiminal(result, loc);
  }

  private firstNilPositionalArg(args: LiminalValue[], params: FuncParam[]): NilValue | null {
    const positional = params.filter(p => p.externalName === null);
    for (let i = 0; i < positional.length && i < args.length; i++) {
      const a = args[i];
      if (isNil(a) && !positional[i].typeAnnotation.optional) return a;
    }
    return null;
  }

  private nilAt(nil: NilValue, loc: { line: number; column: number }): NilValue {
    return nil.propagate({ symbol: "expression", line: loc.line, column: loc.column });
  }

  private wrapError(e: unknown): LiminalMap {
    const m: LiminalMap = new Map();
    if (e instanceof LiminalThrowable) {
      // If the thrown value is already a map, return it directly (for typed errors in Phase 4)
      if (isLiminalMap(e.liminalValue)) return e.liminalValue;
      m.set("message", e.message);
      m.set("name", "LiminalThrowable");
    } else if (e instanceof Error) {
      m.set("message", e.message);
      m.set("name", e.name);
      m.set("stack", e.stack ?? "");
    } else {
      m.set("message", String(e));
    }
    return m;
  }

  private liminalToJs(val: LiminalValue): unknown {
    if (val === null || isNil(val)) return null;
    if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") return val;
    if (Array.isArray(val)) return val.map(v => this.liminalToJs(v));
    if (isLiminalMap(val)) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of val) obj[k] = this.liminalToJs(v);
      return obj;
    }
    if (isInteropValue(val)) return val.value;
    if (isLiminalFunction(val) || isBuiltinFunction(val)) {
      throw new RuntimeError("Cannot pass Liminal function to JS interop");
    }
    return val;
  }

  private jsToLiminal(val: unknown, loc: { line: number; column: number }): LiminalValue {
    if (val === null || val === undefined) {
      return new NilValue({ symbol: "interop", ...loc });
    }
    if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") return val;
    if (Array.isArray(val)) return val.map(v => this.jsToLiminal(v, loc));
    if (typeof val === "function") return { kind: "interop", value: val } as InteropValue;
    if (typeof val === "object") return { kind: "interop", value: val } as InteropValue;
    return null;
  }

  valueToString(val: LiminalValue): string {
    if (val === null || isNil(val)) return "nil";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) return `(list ${val.map(v => this.valueToString(v)).join(" ")})`;
    if (isLiminalTuple(val)) return `(tuple ${val.elements.map(v => this.valueToString(v)).join(" ")})`;
    if (isLiminalMap(val)) {
      const parts = [...val.entries()].map(([k, v]) => `:${k} ${this.valueToString(v)}`);
      return `(map ${parts.join(" ")})`;
    }
    if (isLiminalFunction(val)) return `<func ${val.name ?? "anonymous"}>`;
    if (isBuiltinFunction(val)) return "<builtin>";
    if (isInteropValue(val)) return "<interop>";
    return String(val);
  }
}
