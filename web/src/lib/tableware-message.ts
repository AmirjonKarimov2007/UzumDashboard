import { sellerContact } from "@/lib/tableware-config";
import type { CartLine, ReadySetItem } from "@/lib/tableware-types";
import { products } from "@/data/products";

export function formatTablewarePrice(value: number) {
  // Node and browsers can ship different ICU data for `uz-UZ` (NBSP vs comma),
  // which makes SSR markup differ during hydration. Keep the rendered text stable.
  const rounded = Math.round(Number(value) || 0);
  const formatted = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}${formatted} so'm`;
}

export function buildCartLines(items: ReadySetItem[]): CartLine[] {
  return items
    .map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) return null;
      return {
        productId: item.productId,
        quantity: item.quantity,
        product,
        subtotal: product.price * item.quantity,
      };
    })
    .filter((line): line is CartLine => Boolean(line));
}

export function buildRequestMessage(lines: CartLine[]) {
  const itemLines = lines.map(
    (line, index) =>
      `${index + 1}. ${line.product.code} - ${line.product.name} - ${line.product.size} - ${line.quantity} dona`
  );

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = lines.reduce((sum, line) => sum + line.subtotal, 0);

  return [
    "Assalomu alaykum. Men restoran uchun quyidagi idishlar setini tanladim:",
    "",
    ...itemLines,
    "",
    `Jami mahsulot: ${totalQuantity} dona`,
    `Taxminiy summa: ${formatTablewarePrice(totalPrice)}`,
    "",
    "Menga shu set bo'yicha narx va mavjudlikni aniqlab bering.",
  ].join("\n");
}

export function telegramShareUrl(message: string) {
  const username = sellerContact.telegramUsername.replace(/^@/, "");
  return `https://t.me/${username}?text=${encodeURIComponent(message)}`;
}

export function whatsappShareUrl(message: string) {
  const phone = sellerContact.phone.replace(/[^\d]/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
