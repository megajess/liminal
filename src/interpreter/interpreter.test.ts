import { tokenize } from "../lexer/lexer";
import { parse } from "../parser/parser";
import { Interpreter, RuntimeError } from "./interpreter";
import { NilValue, isNil } from "./nilValue";
import { isLiminalMap, isLiminalTuple } from "./environment";

async function run(src: string) {
  const interp = new Interpreter();
  return interp.run(parse(tokenize(src)));
}

async function runWith(interp: Interpreter, src: string) {
  return interp.run(parse(tokenize(src)));
}

// --- Literals ---

test("number literal", async () => { expect(await run("42")).toBe(42); });
test("negative number", async () => { expect(await run("-7")).toBe(-7); });
test("float", async () => { expect(await run("3.14")).toBe(3.14); });
test("string literal", async () => { expect(await run('"hello"')).toBe("hello"); });
test("boolean true", async () => { expect(await run("true")).toBe(true); });
test("boolean false", async () => { expect(await run("false")).toBe(false); });
test("nil literal", async () => { expect(isNil(await run("nil"))).toBe(true); });

// --- Keywords are self-quoting ---

test("keyword evaluates to itself", async () => { expect(await run(":hello")).toBe(":hello"); });

// --- Interpolated string ---

test("interpolated string", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const name "World")');
  expect(await runWith(interp, '"Hello {name}"')).toBe("Hello World");
});

test("interpolated string with expression", async () => {
  expect(await run('"Result: {(+ 1 2)}"')).toBe("Result: 3");
});

// --- Arithmetic ---

test("addition", async () => { expect(await run("(+ 1 2 3)")).toBe(6); });
test("subtraction", async () => { expect(await run("(- 10 3)")).toBe(7); });
test("negate", async () => { expect(await run("(- 5)")).toBe(-5); });
test("multiplication", async () => { expect(await run("(* 2 3 4)")).toBe(24); });
test("division", async () => { expect(await run("(/ 12 4)")).toBe(3); });
test("modulo", async () => { expect(await run("(mod 10 3)")).toBe(1); });
test("nested arithmetic", async () => { expect(await run("(+ (* 2 3) (- 10 4))")).toBe(12); });

// --- Comparison ---

test("eq true", async () => { expect(await run("(eq 1 1)")).toBe(true); });
test("eq false", async () => { expect(await run("(eq 1 2)")).toBe(false); });
test("less than", async () => { expect(await run("(< 1 2)")).toBe(true); });
test("greater than", async () => { expect(await run("(> 2 1)")).toBe(true); });
test("not", async () => { expect(await run("(not false)")).toBe(true); });

// --- String built-ins ---

test("str concatenation", async () => { expect(await run('(str "hello" " " "world")')).toBe("hello world"); });
test("str with number", async () => { expect(await run('(str "val: " 42)')).toBe("val: 42"); });
test("string concatenation", async () => { expect(await run('(string "a " "b " "c")')).toBe("a b c"); });
test("string coerces number", async () => { expect(await run("(string 42)")).toBe("42"); });
test("string coerces bool", async () => { expect(await run("(string true)")).toBe("true"); });
test("string coerces nil", async () => { expect(await run("(string nil)")).toBe("nil"); });

// --- fmt ---

test("fmt %s", async () => { expect(await run('(fmt "hello %s" "world")')).toBe("hello world"); });
test("fmt %d truncates float", async () => { expect(await run('(fmt "%d" 3.7)')).toBe("3"); });
test("fmt %.2f", async () => { expect(await run('(fmt "%.2f" 3.14159)')).toBe("3.14"); });
test("fmt width right-align", async () => { expect(await run('(fmt "|%10s|" "hi")')).toBe("|        hi|"); });
test("fmt width left-align", async () => { expect(await run('(fmt "|%-10s|" "hi")')).toBe("|hi        |"); });
test("fmt zero-pad", async () => { expect(await run('(fmt "%05d" 42)')).toBe("00042"); });
test("fmt %x hex", async () => { expect(await run('(fmt "%x" 255)')).toBe("ff"); });
test("fmt %X hex upper", async () => { expect(await run('(fmt "%X" 255)')).toBe("FF"); });
test("fmt %o octal", async () => { expect(await run('(fmt "%o" 8)')).toBe("10"); });
test("fmt %b bool", async () => { expect(await run('(fmt "%b" true)')).toBe("true"); });
test("fmt %% literal", async () => { expect(await run('(fmt "100%%")')).toBe("100%"); });
test("fmt nil renders as nil", async () => { expect(await run('(fmt "%d" nil)')).toBe("nil"); });
test("fmt multiple", async () => { expect(await run('(fmt "%s = %d" "x" 42)')).toBe("x = 42"); });

// --- Type conversion ---

test("int from float truncates", async () => { expect(await run("(int 3.7)")).toBe(3); });
test("int from negative float", async () => { expect(await run("(int -3.7)")).toBe(-3); });
test("int from string parses", async () => { expect(await run('(int "42")')).toBe(42); });
test("int from bad string returns nil-ish", async () => {
  const r = await run('(int "hello")');
  expect(r === null || isNil(r)).toBe(true);
});
test("int from int identity", async () => { expect(await run("(int 42)")).toBe(42); });
test("float from int", async () => { expect(await run("(float 3)")).toBe(3); });
test("float from string", async () => { expect(await run('(float "3.14")')).toBe(3.14); });
test("float from bad string returns nil-ish", async () => {
  const r = await run('(float "hello")');
  expect(r === null || isNil(r)).toBe(true);
});
test("bool of true", async () => { expect(await run("(bool true)")).toBe(true); });
test("bool of false", async () => { expect(await run("(bool false)")).toBe(false); });
test("bool of nil", async () => { expect(await run("(bool nil)")).toBe(false); });
test("bool of 0 is true", async () => { expect(await run("(bool 0)")).toBe(true); });
test("bool of empty string is true", async () => { expect(await run('(bool "")')).toBe(true); });
test("bool of non-empty string is true", async () => { expect(await run('(bool "x")')).toBe(true); });
test("bool of empty list is false", async () => { expect(await run("(bool (list))")).toBe(false); });
test("bool of non-empty list is true", async () => { expect(await run("(bool (list 1))")).toBe(true); });
test("bool of empty dict is false", async () => { expect(await run("(bool (dict))")).toBe(false); });
test("bool of empty tuple is false", async () => { expect(await run("(bool (tuple))")).toBe(false); });

// --- Nil propagation through arithmetic/comparison (task 1.8: with trace) ---

test("+ propagates nil", async () => {
  const r = await run("(+ 1 nil 3)");
  expect(isNil(r)).toBe(true);
});
test("* propagates nil", async () => {
  expect(isNil(await run("(* 2 nil)"))).toBe(true);
});
test("- propagates nil", async () => {
  expect(isNil(await run("(- 10 nil)"))).toBe(true);
});
test("< propagates nil", async () => {
  expect(isNil(await run("(< nil 5)"))).toBe(true);
});
test("eq propagates nil", async () => {
  expect(isNil(await run("(eq nil 1)"))).toBe(true);
});
test("nil trace records propagating operator", async () => {
  const r = await run("(+ 1 nil)") as NilValue;
  expect(isNil(r)).toBe(true);
  const symbols = r.trace.map(e => e.symbol);
  expect(symbols).toContain("+");
});
test("nil trace chains through nested ops", async () => {
  const r = await run("(* 2 (+ 1 nil))") as NilValue;
  expect(isNil(r)).toBe(true);
  const symbols = r.trace.map(e => e.symbol);
  expect(symbols).toContain("+");
  expect(symbols).toContain("*");
});

// --- const ---

test("const binding", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const x 10)');
  expect(await runWith(interp, 'x')).toBe(10);
});

test("const is immutable", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const x 10)');
  await expect(runWith(interp, '(set x 20)')).rejects.toThrow();
});

test("mutate bypasses const", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const x 10)');
  await runWith(interp, '(mutate x 99)');
  expect(await runWith(interp, 'x')).toBe(99);
});

// --- var ---

test("var binding with initial value", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(var counter: Int 0)');
  expect(await runWith(interp, 'counter')).toBe(0);
});

test("var can be reassigned with set", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(var x: Int 1)');
  await runWith(interp, '(set x 42)');
  expect(await runWith(interp, 'x')).toBe(42);
});

test("var without init throws when accessed before set", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(var x: Int)');
  await expect(runWith(interp, 'x')).rejects.toThrow();
});

// --- local ---

test("local binding", async () => {
  expect(await run("(local [x 3 y 4] (+ x y))")).toBe(7);
});

test("local bindings are scoped", async () => {
  const interp = new Interpreter();
  await run("(local [x 99] x)");
  await expect(runWith(interp, "x")).rejects.toThrow();
});

test("local sequential binding", async () => {
  expect(await run("(local [x 3 y (* x 2)] y)")).toBe(6);
});

// --- if ---

test("if true branch", async () => { expect(await run("(if true 1 :else 2)")).toBe(1); });
test("if false branch", async () => { expect(await run("(if false 1 :else 2)")).toBe(2); });
test("if no else returns null", async () => { expect(await run("(if false 1)")).toBeNull(); });

// --- cond ---

test("cond first match", async () => {
  expect(await run("(cond (eq 1 1) :a (eq 2 2) :b :else :c)")).toBe(":a");
});

test("cond else branch", async () => {
  expect(await run("(cond (eq 1 2) :a :else :default)")).toBe(":default");
});

// --- do ---

test("do returns last expression", async () => {
  expect(await run("(do 1 2 3)")).toBe(3);
});

// --- func ---

test("function declaration and call", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(func add: Int [a: Int b: Int] (+ a b))");
  expect(await runWith(interp, "(add :a 3 :b 4)")).toBe(7);
});

test("function with positional params", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(func double: Int [_ x: Int] (* x 2))");
  expect(await runWith(interp, "(double 5)")).toBe(10);
});

test("recursive function", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(func factorial: Int [_ n: Int] (if (eq n 0) 1 :else (* n (factorial (- n 1)))))");
  expect(await runWith(interp, "(factorial 5)")).toBe(120);
});

test("function with default param", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(func greet: String [name: String greeting: (String \"Hello\")] (str greeting \", \" name))");
  expect(await runWith(interp, '(greet :name "Alice")')).toBe("Hello, Alice");
  expect(await runWith(interp, '(greet :name "Bob" :greeting "Hi")')).toBe("Hi, Bob");
});

test("closure captures environment", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(func make-adder: Int [_ n: Int] (func: Int [_ x: Int] (+ x n)))");
  await runWith(interp, "(const add5 (make-adder 5))");
  expect(await runWith(interp, "(add5 10)")).toBe(15);
});

// --- async func ---

test("async func resolves correctly", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(async func double: Int [_ x: Int] (* x 2))");
  expect(await runWith(interp, "(double 7)")).toBe(14);
});

// --- collections ---

test("list creation", async () => {
  const result = await run("(list 1 2 3)");
  expect(result).toEqual([1, 2, 3]);
});

test("map creation", async () => {
  const result = await run('(map :name "Alice" :age 30)');
  expect(isLiminalMap(result)).toBe(true);
  const m = result as Map<string, unknown>;
  expect(m.get("name")).toBe("Alice");
  expect(m.get("age")).toBe(30);
});

// --- member access ---

test("member access on map", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const person (map :name "Alice" :age 30))');
  expect(await runWith(interp, "person:name")).toBe("Alice");
  expect(await runWith(interp, "person:age")).toBe(30);
});

test("member access on string: length", async () => {
  expect(await run('"hello":length')).toBe(5);
});

test("missing map key returns nil", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const m (map :x 1))');
  expect(isNil(await runWith(interp, "m:y"))).toBe(true);
});

// --- nil handling ---

test("nil propagates through arithmetic", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(var x: Int? nil)");
  expect(isNil(await runWith(interp, "(+ x 1)"))).toBe(true);
});

test("nil coalesce returns default", async () => {
  expect(await run("(?? nil 42)")).toBe(42);
});

test("nil coalesce returns value when not nil", async () => {
  expect(await run("(?? 10 42)")).toBe(10);
});

test("nil unwrap: non-nil path", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const x 5)');
  expect(await runWith(interp, "(? x :is-nil 0)")).toBe(5);
});

test("nil unwrap: nil path", async () => {
  expect(await run("(? nil :is-nil 99)")).toBe(99);
});

test("nil unwrap: no nil branch propagates nil", async () => {
  expect(isNil(await run("(? nil)"))).toBe(true);
});

test("nil trace is populated", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(var x: Int? nil)");
  const result = await runWith(interp, "x");
  expect(result).toBeInstanceOf(NilValue);
});

// --- try/catch ---

test("try/catch catches error", async () => {
  expect(await run('(try (/ 1 0) (catch err "caught"))')).toBe("caught");
});

test("try/catch: catch binding has message", async () => {
  const interp = new Interpreter();
  const result = await runWith(interp, '(try (/ 1 0) (catch err err:message))');
  expect(typeof result).toBe("string");
});

test("try with no error runs body", async () => {
  expect(await run("(try (+ 1 2) (catch err 0))")).toBe(3);
});

// --- math built-ins ---

test("sqrt", async () => { expect(await run("(sqrt 9)")).toBe(3); });
test("abs", async () => { expect(await run("(abs -5)")).toBe(5); });
test("floor", async () => { expect(await run("(floor 3.7)")).toBe(3); });
test("ceil", async () => { expect(await run("(ceil 3.2)")).toBe(4); });

// --- type predicates ---

test("nil?", async () => { expect(await run("(nil? nil)")).toBe(true); });
test("nil? false for number", async () => { expect(await run("(nil? 1)")).toBe(false); });
test("number?", async () => { expect(await run("(number? 42)")).toBe(true); });
test("string?", async () => { expect(await run('(string? "hi")')).toBe(true); });
test("list?", async () => { expect(await run("(list? (list 1 2))")).toBe(true); });

// --- dict literal ---

test("dict creation", async () => {
  const result = await run('(dict :name "Alice" :age 30)');
  expect(isLiminalMap(result)).toBe(true);
  const m = result as Map<string, unknown>;
  expect(m.get("name")).toBe("Alice");
  expect(m.get("age")).toBe(30);
});

test("dict: empty", async () => {
  const result = await run("(dict)");
  expect(isLiminalMap(result)).toBe(true);
  expect((result as Map<string, unknown>).size).toBe(0);
});

test("dict member access", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const p (dict :name "Bob" :score 99))');
  expect(await runWith(interp, "p:name")).toBe("Bob");
  expect(await runWith(interp, "p:score")).toBe(99);
});

test("dict?", async () => {
  expect(await run("(dict? (dict :a 1))")).toBe(true);
  expect(await run("(dict? (list 1 2))")).toBe(false);
  expect(await run("(dict? 42)")).toBe(false);
});

// --- tuple literal ---

test("tuple creation", async () => {
  const result = await run('(tuple "hello" 42 true)');
  expect(isLiminalTuple(result)).toBe(true);
});

test("tuple: empty", async () => {
  const result = await run("(tuple)");
  expect(isLiminalTuple(result)).toBe(true);
});

test("tuple: numeric index access", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(const t (tuple "hello" 42 true))');
  expect(await runWith(interp, "t:0")).toBe("hello");
  expect(await runWith(interp, "t:1")).toBe(42);
  expect(await runWith(interp, "t:2")).toBe(true);
});

test("tuple: out-of-bounds returns nil", async () => {
  const interp = new Interpreter();
  await runWith(interp, "(const t (tuple 1 2))");
  expect(isNil(await runWith(interp, "t:9"))).toBe(true);
});

test("tuple: length", async () => {
  expect(await run("(tuple 1 2 3):length")).toBe(3);
});

test("tuple?", async () => {
  expect(await run("(tuple? (tuple 1 2))")).toBe(true);
  expect(await run("(tuple? (list 1 2))")).toBe(false);
  expect(await run("(tuple? (dict :a 1))")).toBe(false);
});

// --- throw / ThrowExpression ---

test("throw is caught by try/catch", async () => {
  expect(await run('(try (throw "boom") (catch err err:message))')).toBe("boom");
});

test("throw propagates out of try body", async () => {
  const interp = new Interpreter();
  await runWith(interp, '(func risky [] (throw "oops"))');
  expect(await runWith(interp, '(try (risky) (catch err "caught"))')).toBe("caught");
});

test("throw a dict value — catch sees map fields", async () => {
  const result = await run('(try (throw (dict :code 404 :msg "Not found")) (catch err err:code))');
  expect(result).toBe(404);
});

// --- error cases ---

test("undefined variable throws", async () => {
  await expect(run("undefined-var")).rejects.toThrow();
});

test("call non-function throws", async () => {
  await expect(run("(42 1 2)")).rejects.toThrow(RuntimeError);
});
