import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: "Recebido",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  READY_FOR_PICKUP: "Pronto para retirar",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

export const paymentLabel: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  ONLINE_PIX: "Pix online",
  ONLINE_CARD: "Cartão de crédito online",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  NONE: "",
  AWAITING: "Aguardando pagamento",
  PAID: "Pago online",
  EXPIRED: "Pagamento não concluído",
  REFUNDED: "Pagamento estornado",
  FAILED: "Falha ao gerar o pagamento",
};
