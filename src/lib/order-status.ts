import type { PaymentMethod, PaymentStatus } from "@prisma/client";
import { orderStatusLabelsFor } from "./niche";

/** Nomes das etapas do pedido no delivery. Para outro tipo de loja, use orderStatusLabelsFor(tipo). */
export const orderStatusLabel = orderStatusLabelsFor("FOOD");
export { orderStatusLabelsFor };

export const paymentLabel: Record<PaymentMethod, string> = {
  WHATSAPP: "Combinar pelo WhatsApp",
  PIX: "Pix",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  ONLINE_PIX: "Pix online",
  ONLINE_CARD: "Cartão de crédito online",
  TAB: "Na conta da mesa",
  IN_PERSON: "Pagar no local",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  NONE: "",
  AWAITING: "Aguardando pagamento",
  PAID: "Pago online",
  EXPIRED: "Pagamento não concluído",
  REFUNDED: "Pagamento estornado",
  FAILED: "Falha ao gerar o pagamento",
};
