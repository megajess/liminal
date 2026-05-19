import { tokenize } from "../lexer/lexer";
import { parse } from "../parser/parser";
import { Interpreter, RuntimeError } from "./interpreter";
import { NilValue, isNil } from "./nilValue";
import { isLiminalMap } from "./environment";

function run(src: string) {
  const interp = new Interpreter();
  return interp.run(parse(tokenize(src)));
}

function runWith(interp: Interpreter, src: string) {
  return interp.run(parse(tokenize(src)));
}

// --- Literals ---

test("number literal", () => { expect(run("42")).toBe(42); });
test("negative number", () => { expect(run("-7")).toBe(-7); });
test("float", () => { expect(run("3.14")).toBe(3.14); });
test("string literal", () => { expect(run('"hello"')).toBe("hello"); });
test("boolean true", () => { expect(run("true")).toBe(true); });
test("boolean false", () => { expect(run("false")).toBe(false); });
test("nil literal", () => { expect(isNil(run("nil"))).toBe(true); });

// --- Keywords are self-quoting ---

test("keyword evaluates to itself", () => { expect(run(":hello")).toBe(":hello"); });

// --- Interpolated string ---

test("interpolated string", () => {
  const interp = new Interpreter();
  runWith(interp, '(const name "World")');
  expect(runWith(interp, '"Hello {name}"')).toBe("Hello World");
});

test("interpolated string with expression", () => {
  expect(run('"Result: {(+ 1 2)}"')).toBe("Result: 3");
});

// --- Arithmetic ---

test("addition", () => { expect(run("(+ 1 2 3)")).toBe(6); });
test("subtraction", () => { expect(run("(- 10 3)")).toBe(7); });
test("negate", () => { expect(run("(- 5)")).toBe(-5); });
test("multiplication", () => { expect(run("(* 2 3 4)")).toBe(24); });
test("division", () => { expect(run("(/ 12 4)")).toBe(3); });
test("modulo", () => { expect(run("(mod 10 3)")).toBe(1); });
test("nested arithmetic", () => { expect(run("(+ (* 2 3) (- 10 4))")).toBe(12); });

// --- Comparison ---

test("eq true", () => { expect(run("(eq 1 1)")).toBe(true); });
test("eq false", () => { expect(run("(eq 1 2)")).toBe(false); });
test("less than", () => { expect(run("(< 1 2)")).toBe(true); });
test("greater than", () => { expect(run("(> 2 1)")).toBe(true); });
test("not", () => { expect(run("(not false)")).toBe(true); });

// --- String built-ins ---

test("str concatenation", () => { expect(run('(str "hello" " " "world")')).toBe("hello world"); });
test("str with number", () => { expect(run('(str "val: " 42)')).toBe("val: 42"); });

// --- const ---

test("const binding", () => {
  const interp = new Interpreter();
  runWith(interp, '(const x 10)');
  expect(runWith(interp, 'x')).toBe(10);
});

test("const is immutable", () => {
  const interp = new Interpreter();
  runWith(interp, '(const x 10)');
  expect(() => runWith(interp, '(set x 20)')).toThrow();
});

test("mutate bypasses const", () => {
  const interp = new Interpreter();
  runWith(interp, '(const x 10)');
  runWith(interp, '(mutate x 99)');
  expect(runWith(interp, 'x')).toBe(99);
});

// --- var ---

test("var binding with initial value", () => {
  const interp = new Interpreter();
  runWith(interp, '(var counter: Int 0)');
  expect(runWith(interp, 'counter')).toBe(0);
});

test("var can be reassigned with set", () => {
  const interp = new Interpreter();
  runWith(interp, '(var x: Int 1)');
  runWith(interp, '(set x 42)');
  expect(runWith(interp, 'x')).toBe(42);
});

test("var without init throws when accessed before set", () => {
  const interp = new Interpreter();
  runWith(interp, '(var x: Int)');
  expect(() => runWith(interp, 'x')).toThrow();
});

// --- local ---

test("local binding", () => {
  expect(run("(local [x 3 y 4] (+ x y))")).toBe(7);
});

test("local bindings are scoped", () => {
  const interp = new Interpreter();
  run("(local [x 99] x)");
  expect(() => runWith(interp, "x")).toThrow();
});

test("local sequential binding", () => {
  expect(run("(local [x 3 y (* x 2)] y)")).toBe(6);
});

// --- if ---

test("if true branch", () => { expect(run("(if true 1 :else 2)")).toBe(1); });
test("if false branch", () => { expect(run("(if false 1 :else 2)")).toBe(2); });
test("if no else returns null", () => { expect(run("(if false 1)")).toBeNull(); });

// --- cond ---

test("cond first match", () => {
  expect(run("(cond (eq 1 1) :a (eq 2 2) :b :else :c)")).toBe(":a");
});

test("cond else branch", () => {
  expect(run("(cond (eq 1 2) :a :else :default)")).toBe(":default");
});

// --- do ---

test("do returns last expression", () => {
  expect(run("(do 1 2 3)")).toBe(3);
});

// --- func ---

test("function declaration and call", () => {
  const interp = new Interpreter();
  runWith(interp, "(func add: Int [a: Int b: Int] (+ a b))");
  expect(runWith(interp, "(add :a 3 :b 4)")).toBe(7);
});

test("function with positional params", () => {
  const interp = new Interpreter();
  runWith(interp, "(func double: Int [_ x: Int] (* x 2))");
  expect(runWith(interp, "(double 5)")).toBe(10);
});

test("recursive function", () => {
  const interp = new Interpreter();
  runWith(interp, "(func factorial: Int [_ n: Int] (if (eq n 0) 1 :else (* n (factorial (- n 1)))))");
  expect(runWith(interp, "(factorial 5)")).toBe(120);
});

test("function with default param", () => {
  const interp = new Interpreter();
  runWith(interp, "(func greet: String [name: String greeting: (String \"Hello\")] (str greeting \", \" name))");
  expect(runWith(interp, '(greet :name "Alice")')).toBe("Hello, Alice");
  expect(runWith(interp, '(greet :name "Bob" :greeting "Hi")')).toBe("Hi, Bob");
});

test("closure captures environment", () => {
  const interp = new Interpreter();
  runWith(interp, "(func make-adder: Int [_ n: Int] (func: Int [_ x: Int] (+ x n)))");
  runWith(interp, "(const add5 (make-adder 5))");
  expect(runWith(interp, "(add5 10)")).toBe(15);
});

// --- async func (sync in interpreter) ---

test("async func runs synchronously in interpreter", () => {
  const interp = new Interpreter();
  runWith(interp, "(async func double: Int [_ x: Int] (* x 2))");
  expect(runWith(interp, "(double 7)")).toBe(14);
});

// --- collections ---

test("list creation", () => {
  const result = run("(list 1 2 3)");
  expect(result).toEqual([1, 2, 3]);
});

test("map creation", () => {
  const result = run('(map :name "Alice" :age 30)');
  expect(isLiminalMap(result)).toBe(true);
  const m = result as Map<string, unknown>;
  expect(m.get("name")).toBe("Alice");
  expect(m.get("age")).toBe(30);
});

// --- member access ---

test("member access on map", () => {
  const interp = new Interpreter();
  runWith(interp, '(const person (map :name "Alice" :age 30))');
  expect(runWith(interp, "person:name")).toBe("Alice");
  expect(runWith(interp, "person:age")).toBe(30);
});

test("member access on string: length", () => {
  expect(run('"hello":length')).toBe(5);
});

test("missing map key returns nil", () => {
  const interp = new Interpreter();
  runWith(interp, '(const m (map :x 1))');
  expect(isNil(runWith(interp, "m:y"))).toBe(true);
});

// --- nil handling ---

test("nil propagates through arithmetic", () => {
  const interp = new Interpreter();
  runWith(interp, "(var x: Int? nil)");
  expect(isNil(runWith(interp, "(+ x 1)"))).toBe(true);
});

test("nil coalesce returns default", () => {
  expect(run("(?? nil 42)")).toBe(42);
});

test("nil coalesce returns value when not nil", () => {
  expect(run("(?? 10 42)")).toBe(10);
});

test("nil unwrap: non-nil path", () => {
  const interp = new Interpreter();
  runWith(interp, '(const x 5)');
  expect(runWith(interp, "(? x :is-nil 0)")).toBe(5);
});

test("nil unwrap: nil path", () => {
  expect(run("(? nil :is-nil 99)")).toBe(99);
});

test("nil unwrap: no nil branch propagates nil", () => {
  expect(isNil(run("(? nil)"))).toBe(true);
});

test("nil trace is populated", () => {
  const interp = new Interpreter();
  runWith(interp, "(var x: Int? nil)");
  const result = runWith(interp, "x");
  expect(result).toBeInstanceOf(NilValue);
});

// --- try/catch ---

test("try/catch catches error", () => {
  expect(run('(try (/ 1 0) (catch err "caught"))')).toBe("caught");
});

test("try/catch: catch binding has message", () => {
  const interp = new Interpreter();
  const result = runWith(interp, '(try (/ 1 0) (catch err err:message))');
  expect(typeof result).toBe("string");
});

test("try with no error runs body", () => {
  expect(run("(try (+ 1 2) (catch err 0))")).toBe(3);
});

// --- math built-ins ---

test("sqrt", () => { expect(run("(sqrt 9)")).toBe(3); });
test("abs", () => { expect(run("(abs -5)")).toBe(5); });
test("floor", () => { expect(run("(floor 3.7)")).toBe(3); });
test("ceil", () => { expect(run("(ceil 3.2)")).toBe(4); });

// --- type predicates ---

test("nil?", () => { expect(run("(nil? nil)")).toBe(true); });
test("nil? false for number", () => { expect(run("(nil? 1)")).toBe(false); });
test("number?", () => { expect(run("(number? 42)")).toBe(true); });
test("string?", () => { expect(run('(string? "hi")')).toBe(true); });
test("list?", () => { expect(run("(list? (list 1 2))")).toBe(true); });

// --- error cases ---

test("undefined variable throws", () => {
  expect(() => run("undefined-var")).toThrow();
});

test("call non-function throws", () => {
  expect(() => run("(42 1 2)")).toThrow(RuntimeError);
});
