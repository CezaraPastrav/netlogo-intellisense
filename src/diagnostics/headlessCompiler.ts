import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

export const SOURCE_COMPILER = "netlogo-compiler";

/**
 * NetLogo has no compile-only mode. Asking headless to run an experiment that
 * cannot exist makes it open and compile the model - reporting any compile
 * error - and then fail on the experiment lookup, which we read as success.
 */
const PROBE_EXPERIMENT = "__netlogo_intellisense_compile_probe__";
const NO_SUCH_EXPERIMENT = /does not contain the experiment/i;

export interface CompilerLocation {
  javaPath: string;
  jarPath: string;
  extensionsDir: string;
  netLogoDir: string;
}

export interface CompileError {
  message: string;
  /** Absolute path of the file the error is in, or undefined for the model itself. */
  file?: string;
  /** Character offset into the LF-normalised text of that file's code. */
  offset?: number;
}

export interface CompileOutcome {
  ok: boolean;
  errors: CompileError[];
  /** Set when the compiler could not be run at all. */
  failure?: string;
}

/** Candidate install directories, newest-looking first. */
function candidateDirs(): string[] {
  const out: string[] = [];
  if (process.platform === "win32") {
    for (const base of [
      process.env["ProgramFiles"] ?? "C:\\Program Files",
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    ]) {
      try {
        for (const name of fs.readdirSync(base)) {
          if (/^NetLogo/i.test(name)) out.push(path.join(base, name));
        }
      } catch {
        // base does not exist
      }
    }
  } else if (process.platform === "darwin") {
    try {
      for (const name of fs.readdirSync("/Applications")) {
        if (/^NetLogo/i.test(name)) out.push(path.join("/Applications", name));
      }
    } catch {
      // no /Applications
    }
  } else {
    for (const base of ["/opt", "/usr/local", path.join(os.homedir(), ".local")]) {
      try {
        for (const name of fs.readdirSync(base)) {
          if (/^netlogo/i.test(name)) out.push(path.join(base, name));
        }
      } catch {
        // base does not exist
      }
    }
  }
  // Prefer higher version numbers.
  return out.sort().reverse();
}

/** Resolve the pieces needed to invoke NetLogo headless. */
export function locateCompiler(configuredDir?: string): CompilerLocation | undefined {
  const dirs = configuredDir ? [configuredDir, ...candidateDirs()] : candidateDirs();

  for (const dir of dirs) {
    if (!dir) continue;
    const appDir = path.join(dir, "app");
    let jarPath: string | undefined;
    try {
      const jars = fs.readdirSync(appDir).filter((f) => /^netlogo-[\d.]+\.jar$/i.test(f));
      if (jars.length) jarPath = path.join(appDir, jars.sort().reverse()[0]);
    } catch {
      continue;
    }
    if (!jarPath) continue;

    const bundled = path.join(
      dir,
      "runtime",
      "bin",
      process.platform === "win32" ? "java.exe" : "java"
    );
    const javaPath = fs.existsSync(bundled)
      ? bundled
      : process.platform === "win32"
      ? "java.exe"
      : "java";

    return {
      javaPath,
      jarPath,
      extensionsDir: path.join(dir, "extensions"),
      netLogoDir: dir,
    };
  }
  return undefined;
}

/**
 * Parse NetLogo's compile diagnostics.
 *
 * Two observed shapes:
 *   "Nothing named FOO has been defined. at position 84 in C:\...\thing.nls"
 *   "Nothing named FOO has been defined. at position 534 in "   (the model itself)
 */
export function parseCompilerOutput(stderr: string): CompileError[] {
  const errors: CompileError[] = [];
  const text = stderr.trim();
  if (!text) return errors;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^java\.lang\.\w+(?:Exception)?:\s*/, "").trim();
    if (!line) continue;
    if (NO_SUCH_EXPERIMENT.test(line)) continue;
    // Ignore the JAVA_HOME advisory the launcher prints.
    if (/^(JAVA_HOME|If you encounter errors)/i.test(line)) continue;

    const m = line.match(/^(.*?)\s+at position (\d+) in\s*(.*)$/);
    if (m) {
      const file = m[3].trim();
      errors.push({
        message: m[1].trim(),
        offset: Number(m[2]),
        file: file.length ? file : undefined,
      });
    } else {
      errors.push({ message: line });
    }
  }
  return errors;
}

let running: ChildProcess | undefined;

/** Cancel any in-flight compile. */
export function cancelRunningCompile(): void {
  if (running) {
    running.kill();
    running = undefined;
  }
}

/**
 * Compile `modelPath` and report any errors.
 */
export function compileModel(
  location: CompilerLocation,
  modelPath: string,
  timeoutMs: number
): Promise<CompileOutcome> {
  cancelRunningCompile();

  return new Promise<CompileOutcome>((resolve) => {
    const args = [
      "-XX:MaxRAMPercentage=50",
      "-Dfile.encoding=UTF-8",
      `-Dnetlogo.extensions.dir=${location.extensionsDir}`,
      `-Dnetlogo.models.dir=${path.join(location.netLogoDir, "models")}`,
      "--add-exports=java.base/java.lang=ALL-UNNAMED",
      "--add-exports=java.desktop/sun.awt=ALL-UNNAMED",
      "--add-exports=java.desktop/sun.java2d=ALL-UNNAMED",
      "-classpath",
      location.jarPath,
      "org.nlogo.headless.Main",
      "--model",
      modelPath,
      "--experiment",
      PROBE_EXPERIMENT,
    ];

    let child: ChildProcess;
    try {
      child = spawn(location.javaPath, args, {
        cwd: path.dirname(modelPath),
        windowsHide: true,
      });
    } catch (err) {
      resolve({ ok: false, errors: [], failure: String(err) });
      return;
    }
    running = child;

    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.stdout?.on("data", (d) => (stdout += d.toString()));

    const timer = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        errors: [],
        failure: `NetLogo compile timed out after ${Math.round(timeoutMs / 1000)}s.`,
      });
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      if (running === child) running = undefined;
      resolve({ ok: false, errors: [], failure: err.message });
    });

    child.on("close", () => {
      clearTimeout(timer);
      if (running === child) running = undefined;

      const combined = `${stderr}\n${stdout}`;
      const errors = parseCompilerOutput(combined);
      // Reaching the experiment lookup means the model compiled.
      const compiled = NO_SUCH_EXPERIMENT.test(combined);
      resolve({ ok: errors.length === 0 && compiled, errors });
    });
  });
}
