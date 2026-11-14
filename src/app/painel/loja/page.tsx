import { requireStoreUser } from "@/lib/auth";
import { StoreSettingsForm } from "@/components/StoreSettingsForm";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const { store } = await requireStoreUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Minha loja</h1>
      <div className="card text-sm">
        Link do seu cardápio: <a className="font-medium text-brand-700" href={`/loja/${store.slug}`} target="_blank">/loja/{store.slug}</a>
      </div>
      <StoreSettingsForm
        store={{
          name: store.name,
          description: store.description ?? "",
          whatsapp: store.whatsapp ?? "",
          address: store.address ?? "",
          pixKey: store.pixKey ?? "",
          logoUrl: store.logoUrl ?? "",
          themeColor: store.themeColor ?? "",
          deliveryFee: (store.deliveryFeeCents / 100).toFixed(2).replace(".", ","),
          minOrder: (store.minOrderCents / 100).toFixed(2).replace(".", ","),
          acceptsDelivery: store.acceptsDelivery,
          acceptsPickup: store.acceptsPickup,
          isOpen: store.isOpen,
        }}
      />
    </div>
  );
}
