import { useTranslations } from "next-intl";
import type { ComplaintStatus } from "@/lib/types";

const STATUS_STYLES: Record<ComplaintStatus, string> = {
  Open: "bg-blue-100 text-blue-800",
  Assigned: "bg-indigo-100 text-indigo-800",
  Processing: "bg-amber-100 text-amber-800",
  Cancel: "bg-gray-200 text-gray-700",
  Closed: "bg-green-100 text-green-800",
};

export default function StatusBadge({ status }: { status: ComplaintStatus }) {
  const t = useTranslations("status");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {t(status)}
    </span>
  );
}
