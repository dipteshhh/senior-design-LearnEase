export function readEnvInt(name: string, defaultValue: number, minValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return defaultValue;
  }

  return Math.floor(parsed);
}
