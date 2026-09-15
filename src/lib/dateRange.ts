export type DateFilter = "all" | "today" | "7d" | "30d" | "month" | "custom";

export function cutoffFor(filter: DateFilter): Date | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "custom":
    case "all":
    default:
      return null;
  }
}

// customFrom/customTo are "YYYY-MM-DD" strings (empty when unset). Only
// meaningful when filter === "custom" — every other filter goes through
// cutoffFor's fixed lower bound with no upper bound.
export function dateRangeFor(
  filter: DateFilter,
  customFrom: string,
  customTo: string
): { from: Date | null; to: Date | null } {
  if (filter === "custom") {
    const to = customTo ? new Date(customTo) : null;
    if (to) to.setHours(23, 59, 59, 999);
    return { from: customFrom ? new Date(customFrom) : null, to };
  }
  return { from: cutoffFor(filter), to: null };
}
