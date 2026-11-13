import { situationLabel, type StoreSituation } from "@/lib/subscription";

const colors: Record<StoreSituation, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  TRIAL: "bg-blue-100 text-blue-800",
  TRIAL_EXPIRED: "bg-stone-200 text-stone-700",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-stone-200 text-stone-700",
  BLOCKED: "bg-red-100 text-red-800",
};

export function SituationBadge({ situation }: { situation: StoreSituation }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${colors[situation]}`}>{situationLabel[situation]}</span>;
}
