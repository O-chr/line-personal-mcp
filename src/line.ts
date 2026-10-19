import { spawn } from "node:child_process";

const LINE_BIN = process.env.LINE_BIN ?? `${process.env.HOME}/.local/bin/line`;

export function runLine(args: string[], stdin?: string, timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // No shell: arguments are passed as an argv array.
    const p = spawn(LINE_BIN, ["--error-format", "json", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
    p.stdin.end(stdin ?? "");
  });
}
