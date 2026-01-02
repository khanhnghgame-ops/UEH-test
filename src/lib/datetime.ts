import { format } from "date-fns";
import { vi } from "date-fns/locale";

/**
 * Parse a datetime string as a *local wall-clock time*.
 *
 * Why: deadlines in this app are stored/displayed as local times (e.g. 23:00),
 * and we must avoid implicit UTC conversions that cause shifts like 23:00 -> 06:00.
 *
 * Supports values like:
 * - "YYYY-MM-DDTHH:mm"
 * - "YYYY-MM-DDTHH:mm:ss"
 * - "YYYY-MM-DDTHH:mm:ss.sssZ" (we intentionally ignore timezone/seconds)
 */
export function parseLocalDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  // Normalize to YYYY-MM-DDTHH:mm if possible
  const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const hour = isoMatch[4] ? Number(isoMatch[4]) : 0;
    const minute = isoMatch[5] ? Number(isoMatch[5]) : 0;

    const d = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Fallback (should rarely be used)
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getDeadlineTimeMs(value?: string | null): number | null {
  const d = parseLocalDateTime(value);
  return d ? d.getTime() : null;
}

export function isDeadlineOverdue(value?: string | null): boolean {
  const ms = getDeadlineTimeMs(value);
  if (!ms) return false;
  return ms < Date.now();
}

/** dd/MM/yyyy – HH:mm */
export function formatDeadlineVN(value?: string | null): string {
  const d = parseLocalDateTime(value);
  return d ? format(d, "dd/MM/yyyy – HH:mm", { locale: vi }) : "";
}

/** dd/MM – HH:mm */
export function formatDeadlineShortVN(value?: string | null): string {
  const d = parseLocalDateTime(value);
  return d ? format(d, "dd/MM – HH:mm", { locale: vi }) : "";
}

/** dd/MM */
export function formatDateVN(value?: string | null): string {
  const d = parseLocalDateTime(value);
  return d ? format(d, "dd/MM", { locale: vi }) : "";
}
