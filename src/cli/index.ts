#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { tokenize, LexerError } from "../lexer/lexer";
import { parse, ParseError } from "../parser/parser";
import { Interpreter, RuntimeError } from "../interpreter/interpreter";
import { startRepl } from "../repl/repl";

const USAGE = `Usage:
  lmnl                          Start the interactive REPL
  lmnl run <file>               Run a Liminal source file
  lmnl build <file> --target <node|native>
                                Compile a Liminal source file (not yet implemented)
  lmnl -h | --help              Show this help
`;

function die(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function runFile(file: string): Promise<void> {
  const resolved = path.resolve(process.cwd(), file);
  let source: string;
  try {
    source = fs.readFileSync(resolved, "utf8");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    die(`lmnl: cannot read ${file}: ${msg}`);
  }

  try {
    const tokens = tokenize(source);
    const program = parse(tokens);
    const interp = new Interpreter();
    await interp.run(program);
  } catch (e) {
    if (e instanceof LexerError || e instanceof ParseError || e instanceof RuntimeError) {
      die(`${e.name} in ${file}: ${e.message}`);
    }
    if (e instanceof Error) {
      die(`Error in ${file}: ${e.message}`);
    }
    throw e;
  }
}

function buildFile(args: string[]): never {
  const rest = args.slice(1);
  const file = rest.find((a) => !a.startsWith("--"));
  if (!file) die(`lmnl build: missing <file>\n\n${USAGE}`);

  const targetIdx = rest.indexOf("--target");
  const target = targetIdx >= 0 ? rest[targetIdx + 1] : undefined;
  if (!target) die(`lmnl build: --target <node|native> is required`);
  if (target !== "node" && target !== "native") {
    die(`lmnl build: unknown target '${target}' (expected node or native)`);
  }

  die(`lmnl build: not yet implemented (would compile ${file} for --target ${target})`, 2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    startRepl();
    return;
  }

  const [cmd, ...rest] = args;

  if (cmd === "-h" || cmd === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  if (cmd === "run") {
    const file = rest[0];
    if (!file) die(`lmnl run: missing <file>\n\n${USAGE}`);
    await runFile(file);
    return;
  }

  if (cmd === "build") {
    buildFile(args);
    return;
  }

  die(`lmnl: unknown command '${cmd}'\n\n${USAGE}`);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.stack ?? e.message : String(e);
  die(`lmnl: ${msg}`);
});
