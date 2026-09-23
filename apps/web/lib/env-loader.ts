import fs from "node:fs";
import path from "node:path";

let initialized = false;

export function sanitizeEnvValue(raw?: string): string {
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      let val = line.slice(eqIndex + 1).trim();
      val = sanitizeEnvValue(val);
      result[key] = val;
    }
  } catch {
    // Ignore read errors
  }
  return result;
}

export function loadAppEnv(): NodeJS.ProcessEnv {
  if (initialized) return process.env;

  const candidateDirs = [
    process.cwd(),
    path.resolve(process.cwd(), "apps", "web"),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", ".."),
    __dirname,
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
  ];

  const envFiles: string[] = [];
  for (const dir of candidateDirs) {
    const localFile = path.join(dir, ".env.local");
    if (!envFiles.includes(localFile) && fs.existsSync(localFile)) {
      envFiles.push(localFile);
    }
    const defaultFile = path.join(dir, ".env");
    if (!envFiles.includes(defaultFile) && fs.existsSync(defaultFile)) {
      envFiles.push(defaultFile);
    }
  }

  // Load in order of precedence: process.env > candidate files (first found wins)
  for (const file of envFiles) {
    const vars = parseEnvFile(file);
    for (const [key, val] of Object.entries(vars)) {
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }

  if (process.env.SECTORS_API_KEY) {
    process.env.SECTORS_API_KEY = sanitizeEnvValue(process.env.SECTORS_API_KEY);
  }

  initialized = true;
  return process.env;
}
