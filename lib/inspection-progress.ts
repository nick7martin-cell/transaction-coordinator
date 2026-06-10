export function getInspectionProgress(
  acceptanceDate: string | null,
  inspectionPeriodDays: number | null,
  expirationDate: string | null
): { percent: number; label: string } | null {
  const start = acceptanceDate ? new Date(acceptanceDate + "T12:00:00") : null;
  const end = expirationDate
    ? new Date(expirationDate + "T12:00:00")
    : start && inspectionPeriodDays
      ? new Date(start.getTime() + inspectionPeriodDays * 86400000)
      : null;

  if (!end) return null;

  const startTime = start?.getTime() ?? end.getTime() - 10 * 86400000;
  const now = Date.now();
  const total = end.getTime() - startTime;
  if (total <= 0) return { percent: 100, label: "Expired" };

  const elapsed = now - startTime;
  const percent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  if (now > end.getTime()) {
    return { percent: 100, label: "Period ended" };
  }

  const daysLeft = Math.ceil((end.getTime() - now) / 86400000);
  return { percent, label: `${daysLeft} days remaining` };
}
