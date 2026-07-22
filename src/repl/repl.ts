import * as readline from "node:readline";
import { tokenize, LexerError } from "../lexer/lexer";
import { parse, ParseError } from "../parser/parser";
import { Interpreter, RuntimeError } from "../interpreter/interpreter";
import { valueToString } from "../interpreter/builtins";
import { isNil } from "../interpreter/nilValue";

const PROMPT_PRIMARY = "lmnl> ";
const PROMPT_CONTINUE = "...   ";

type CompletenessResult =
  | { kind: "complete" }
  | { kind: "incomplete" }
  | { kind: "unbalanced"; message: string };

function checkCompleteness(source: string): CompletenessResult {
  let depth = 0;
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === ";") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < n) {
        const c = source[i];
        if (c === "\\") { i += 2; continue; }
        if (c === "{") {
          i++;
          let braceDepth = 1;
          while (i < n && braceDepth > 0) {
            const cc = source[i];
            if (cc === "(") depth++;
            else if (cc === ")") depth--;
            else if (cc === "{") braceDepth++;
            else if (cc === "}") braceDepth--;
            i++;
          }
          if (braceDepth > 0) return { kind: "incomplete" };
          continue;
        }
        if (c === '"') { i++; break; }
        i++;
      }
      if (i > n) return { kind: "incomplete" };
      continue;
    }

    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return { kind: "unbalanced", message: "unexpected `)`" };
    }
    i++;
  }

  if (depth > 0) return { kind: "incomplete" };
  return { kind: "complete" };
}

function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

async function evalAndPrint(interp: Interpreter, source: string): Promise<void> {
  try {
    const tokens = tokenize(source);
    const program = parse(tokens);
    const result = await interp.run(program);
    if (result !== null && result !== undefined && !isNil(result)) {
      console.log(valueToString(result));
    }
  } catch (e) {
    if (e instanceof LexerError || e instanceof ParseError || e instanceof RuntimeError) {
      console.error(`${e.name}: ${e.message}`);
    } else if (e instanceof Error) {
      console.error(`${e.name}: ${e.message}`);
    } else {
      console.error(String(e));
    }
  }
}

export function startRepl(): void {
  const interp = new Interpreter();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT_PRIMARY,
  });

  let buffer = "";
  let pending: Promise<void> = Promise.resolve();

  console.log("Liminal REPL — Ctrl-D or .exit to quit");
  rl.prompt();

  const handleLine = async (line: string): Promise<void> => {
    if (buffer === "" && line.trim() === ".exit") {
      rl.close();
      return;
    }

    buffer += line + "\n";

    const status = checkCompleteness(buffer);

    if (status.kind === "incomplete") {
      rl.setPrompt(PROMPT_CONTINUE);
      rl.prompt();
      return;
    }

    if (status.kind === "unbalanced") {
      console.error(`SyntaxError: ${status.message}`);
      buffer = "";
      rl.setPrompt(PROMPT_PRIMARY);
      rl.prompt();
      return;
    }

    if (isBlank(buffer)) {
      buffer = "";
      rl.setPrompt(PROMPT_PRIMARY);
      rl.prompt();
      return;
    }

    const source = buffer;
    buffer = "";
    await evalAndPrint(interp, source);
    rl.setPrompt(PROMPT_PRIMARY);
    rl.prompt();
  };

  rl.on("line", (line) => {
    pending = pending.then(() => handleLine(line));
  });

  rl.on("close", () => {
    console.log();
    process.exit(0);
  });
}

if (require.main === module) {
  startRepl();
}
