"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { products } from "@/data/products";
import { buildRequestMessage } from "@/lib/tableware-message";
import type { CartItem, CartLine, Product, ReadySetItem } from "@/lib/tableware-types";

interface CartContextValue {
  items: CartItem[];
  lines: CartLine[];
  totalQuantity: number;
  totalPrice: number;
  message: string;
  addProduct: (product: Product, quantity?: number) => void;
  addItems: (items: ReadySetItem[]) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeProduct: (productId: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const storageKey = "restaurant-tableware-set";

function normalize(items: CartItem[]) {
  return items.filter((item) => item.quantity > 0 && products.some((product) => product.id === item.productId));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setItems(normalize(JSON.parse(raw)));
    } catch {
      setItems([]);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    }
  }, [hasLoaded, items]);

  const lines = useMemo<CartLine[]>(() => {
    return items
      .map((item) => {
        const product = products.find((candidate) => candidate.id === item.productId);
        if (!product) return null;
        return {
          ...item,
          product,
          subtotal: product.price * item.quantity,
        };
      })
      .filter((line): line is CartLine => Boolean(line));
  }, [items]);

  const totalQuantity = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const totalPrice = useMemo(() => lines.reduce((sum, line) => sum + line.subtotal, 0), [lines]);
  const message = useMemo(() => buildRequestMessage(lines), [lines]);

  const addItems = (newItems: ReadySetItem[]) => {
    setItems((current) => {
      const next = [...current];
      for (const item of newItems) {
        const existing = next.find((candidate) => candidate.productId === item.productId);
        if (existing) existing.quantity += item.quantity;
        else next.push({ productId: item.productId, quantity: item.quantity });
      }
      return normalize(next);
    });
  };

  const value: CartContextValue = {
    items,
    lines,
    totalQuantity,
    totalPrice,
    message,
    addProduct: (product, quantity = 1) => addItems([{ productId: product.id, quantity }]),
    addItems,
    updateQuantity: (productId, quantity) => {
      setItems((current) =>
        normalize(current.map((item) => (item.productId === productId ? { ...item, quantity } : item)))
      );
    },
    removeProduct: (productId) => {
      setItems((current) => current.filter((item) => item.productId !== productId));
    },
    clearCart: () => setItems([]),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
