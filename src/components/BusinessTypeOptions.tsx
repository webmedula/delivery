import { NICHES, UPCOMING_NICHES } from "@/lib/niche";
import { TABLE_SIGNUP } from "@/lib/tables";

/** "Que tipo de negócio você tem?" do cadastro (com senha e com Google). */
export function BusinessTypeOptions({ chosen }: { chosen: string }) {
  // Restaurante com mesas aparece logo depois do delivery.
  const options = NICHES.flatMap((n) => (n.value === "FOOD" ? [n, TABLE_SIGNUP] : [n]));
  return (
    <fieldset className="space-y-2">
      <legend className="label">Que tipo de negócio você tem?</legend>
      {options.map((n) => (
        <label
          key={n.value}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm transition has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:ring-1 has-[:checked]:ring-brand-500"
        >
          <input type="radio" name="businessType" value={n.value} defaultChecked={n.value === chosen} className="mt-1 accent-brand-600" />
          <span>
            <strong className="block text-stone-900">{n.title}</strong>
            <span className="text-stone-500">{n.examples}</span>
          </span>
        </label>
      ))}
      {UPCOMING_NICHES.length > 0 && (
        <p className="px-1 text-xs text-stone-500">
          Em breve: {UPCOMING_NICHES.map((n) => `${n.title.toLowerCase()} (${n.examples.toLowerCase()})`).join(" e ")}.
        </p>
      )}
    </fieldset>
  );
}
