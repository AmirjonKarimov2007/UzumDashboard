import { ComponentType, CSSProperties } from "react";

// ─── Auth ────────────────────────────────────────────────────────────────────
export interface Store {
  id: string;
  name: string;
  plan?: string;
  avatar?: string;
  revenue?: number;
  orders?: number;
  status?: "active" | "inactive" | "suspended";
}

export interface User {
  id: string;
  phone: string;
  name?: string;
  avatar?: string;
  email?: string;
  stores: Store[];
  role?: "owner" | "admin" | "analyst" | "viewer";
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export type TimeRange = "today" | "week" | "month" | "quarter" | "year";

export interface MetricData {
  title: string;
  value: string | number;
  rawValue?: number;
  change: number;
  changeLabel?: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  gradient: string;
  color: string;
  sparkline: number[];
  prefix?: string;
  suffix?: string;
  description?: string;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  secondary?: number;
  tertiary?: number;
  [key: string]: string | number | undefined;
}

// ─── Products ────────────────────────────────────────────────────────────────
export type ProductStatus = "active" | "paused" | "out_of_stock" | "pending";
export type ProductCategory =
  | "electronics"
  | "clothing"
  | "food"
  | "home"
  | "beauty"
  | "sports"
  | "books"
  | "other";

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: ProductCategory;
  price: number;
  costPrice: number;
  stock: number;
  sold: number;
  revenue: number;
  profit: number;
  margin: number;
  status: ProductStatus;
  image?: string;
  rating: number;
  reviews: number;
  views: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Orders ──────────────────────────────────────────────────────────────────
export type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";
export type PaymentMethod = "card" | "cash" | "transfer" | "uzum_pay";

export interface OrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    address: string;
    city: string;
  };
  items: OrderItem[];
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  commission: number;
  total: number;
  profit: number;
  createdAt: string;
  updatedAt: string;
  shippedAt?: string;
  deliveredAt?: string;
  trackingNumber?: string;
  notes?: string;
}

// ─── Finance ─────────────────────────────────────────────────────────────────
export type ExpenseCategory =
  | "commission"
  | "shipping"
  | "packaging"
  | "advertising"
  | "tax"
  | "salary"
  | "rent"
  | "other";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  recurring?: boolean;
}

export interface FinancialSummary {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  commissions: number;
  taxes: number;
  cashflow: number;
}

// ─── Transactions ────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  storeId?: string;
  type: "sale" | "refund" | "expense" | "income";
  amount: number;
  currency?: string;
  description?: string;
  status: "pending" | "completed" | "failed";
  category?: string;
  createdAt: string;
}

// ─── Inventory ───────────────────────────────────────────────────────────────
export interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  category: ProductCategory;
  currentStock: number;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  unitCost: number;
  totalValue: number;
  lastRestocked: string;
  soldLast30Days: number;
  daysUntilStockout: number;
  status: "in_stock" | "low_stock" | "out_of_stock" | "overstock";
}

// ─── Notifications ───────────────────────────────────────────────────────────
export type NotificationType = "success" | "warning" | "error" | "info" | "ai";
export type NotificationCategory =
  | "order"
  | "product"
  | "finance"
  | "inventory"
  | "ai"
  | "system"
  | "team";

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, string | number>;
  // legacy compat
  read?: boolean;
  action?: { label: string; url: string };
}

// ─── Team ────────────────────────────────────────────────────────────────────
export type TeamRole = "owner" | "admin" | "analyst" | "viewer";

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  phone: string;
  role: TeamRole;
  avatar?: string;
  status: "active" | "invited" | "suspended";
  joinedAt: string;
  lastActive?: string;
  permissions: string[];
}

// ─── AI Insights ─────────────────────────────────────────────────────────────
export type InsightSeverity = "critical" | "high" | "medium" | "low";
export type InsightType =
  | "dead_product"
  | "price_optimization"
  | "stock_alert"
  | "trend"
  | "competitor"
  | "opportunity";

export interface AIInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  potentialGain?: number;
  affectedProduct?: string;
  confidence: number;
  createdAt: string;
  dismissed?: boolean;
}

// ─── Reports ─────────────────────────────────────────────────────────────────
export type ReportType =
  | "sales"
  | "products"
  | "finance"
  | "inventory"
  | "orders"
  | "custom";
export type ReportFormat = "pdf" | "excel" | "csv";

export interface Report {
  id: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  dateRange: { from: string; to: string };
  createdAt: string;
  size: string;
  status: "ready" | "generating" | "failed";
}

// ─── Analytics ───────────────────────────────────────────────────────────────
export interface AnalyticsMetric {
  name: string;
  value: number;
  change: number;
  previousValue: number;
}
