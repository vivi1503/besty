import type { Status } from "@/lib/types";

const labels: Record<Status, string> = {
  pass: "תקין",
  warning: "אזהרה",
  fail: "דגל אדום",
  insufficient: "אין מספיק מידע"
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}>{labels[status]}</span>;
}
