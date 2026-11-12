import type { OrderStatus } from "@prisma/client";

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirar",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

export const paymentLabel = { PIX: "Pix", CASH: "Dinheiro", CARD_ON_DELIVERY: "Cartão na entrega" } as const;
