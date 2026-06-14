import type {
  Product,
  Order,
  InventoryItem,
  Notification,
  TeamMember,
  AIInsight,
  Report,
  ChartDataPoint,
} from "@/types";

// ─── Revenue chart data ───────────────────────────────────────────────────────
export const revenueData: ChartDataPoint[] = [
  { name: "Yan", value: 42500000, secondary: 28000000, tertiary: 14500000 },
  { name: "Fev", value: 51200000, secondary: 33500000, tertiary: 17700000 },
  { name: "Mar", value: 47800000, secondary: 31000000, tertiary: 16800000 },
  { name: "Apr", value: 63400000, secondary: 41000000, tertiary: 22400000 },
  { name: "May", value: 71200000, secondary: 46500000, tertiary: 24700000 },
  { name: "Iyun", value: 68900000, secondary: 44800000, tertiary: 24100000 },
  { name: "Iyul", value: 84300000, secondary: 55000000, tertiary: 29300000 },
  { name: "Avg", value: 92600000, secondary: 60500000, tertiary: 32100000 },
  { name: "Sen", value: 88400000, secondary: 57600000, tertiary: 30800000 },
  { name: "Okt", value: 104500000, secondary: 68000000, tertiary: 36500000 },
  { name: "Noy", value: 118200000, secondary: 77000000, tertiary: 41200000 },
  { name: "Dek", value: 135600000, secondary: 88500000, tertiary: 47100000 },
];

export const weeklyRevenueData: ChartDataPoint[] = [
  { name: "Dush", value: 8200000, secondary: 5400000 },
  { name: "Sesh", value: 9600000, secondary: 6300000 },
  { name: "Chor", value: 11200000, secondary: 7400000 },
  { name: "Pay", value: 10800000, secondary: 7100000 },
  { name: "Jum", value: 14600000, secondary: 9600000 },
  { name: "Shan", value: 18200000, secondary: 12000000 },
  { name: "Yak", value: 15800000, secondary: 10400000 },
];

export const dailyRevenueData: ChartDataPoint[] = Array.from({ length: 24 }, (_, i) => ({
  name: `${String(i).padStart(2, "0")}:00`,
  value: Math.floor(Math.random() * 4000000 + 500000),
  secondary: Math.floor(Math.random() * 2500000 + 300000),
}));

// ─── Category data ────────────────────────────────────────────────────────────
export const categoryData = [
  { name: "Elektronika", value: 38, color: "#8b5cf6" },
  { name: "Kiyim", value: 24, color: "#3b82f6" },
  { name: "Oziq-ovqat", value: 16, color: "#10b981" },
  { name: "Uy jihozlari", value: 12, color: "#f59e0b" },
  { name: "Go'zallik", value: 7, color: "#ec4899" },
  { name: "Boshqa", value: 3, color: "#71717a" },
];

export const ordersStatusData = [
  { name: "Yetkazilgan", value: 68, color: "#10b981" },
  { name: "Yuborilgan", value: 14, color: "#3b82f6" },
  { name: "Jarayonda", value: 10, color: "#f59e0b" },
  { name: "Kutilmoqda", value: 5, color: "#8b5cf6" },
  { name: "Bekor", value: 3, color: "#ef4444" },
];

// ─── Orders trend ─────────────────────────────────────────────────────────────
export const ordersData: ChartDataPoint[] = [
  { name: "Yan", value: 842, secondary: 28 },
  { name: "Fev", value: 1024, secondary: 34 },
  { name: "Mar", value: 956, secondary: 22 },
  { name: "Apr", value: 1268, secondary: 41 },
  { name: "May", value: 1422, secondary: 38 },
  { name: "Iyun", value: 1380, secondary: 45 },
  { name: "Iyul", value: 1688, secondary: 52 },
  { name: "Avg", value: 1848, secondary: 48 },
  { name: "Sen", value: 1762, secondary: 56 },
  { name: "Okt", value: 2090, secondary: 62 },
  { name: "Noy", value: 2364, secondary: 71 },
  { name: "Dek", value: 2712, secondary: 84 },
];

// ─── Products ─────────────────────────────────────────────────────────────────
export const mockProducts: Product[] = [
  {
    id: "p1",
    name: "Samsung Galaxy A54 5G 128GB",
    sku: "SAM-A54-128",
    category: "electronics",
    price: 4890000,
    costPrice: 3600000,
    stock: 24,
    sold: 142,
    revenue: 694380000,
    profit: 183260000,
    margin: 26.4,
    status: "active",
    rating: 4.7,
    reviews: 89,
    views: 8420,
    createdAt: "2024-01-15T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p2",
    name: 'Xiaomi Redmi Note 13 Pro 256GB',
    sku: "XMI-RN13P-256",
    category: "electronics",
    price: 3990000,
    costPrice: 2950000,
    stock: 8,
    sold: 208,
    revenue: 830320000,
    profit: 216320000,
    margin: 26.1,
    status: "active",
    rating: 4.6,
    reviews: 124,
    views: 12800,
    createdAt: "2024-02-01T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p3",
    name: "Nike Air Max 270 React",
    sku: "NK-AM270R-42",
    category: "clothing",
    price: 890000,
    costPrice: 520000,
    stock: 0,
    sold: 67,
    revenue: 59630000,
    profit: 24790000,
    margin: 41.6,
    status: "out_of_stock",
    rating: 4.8,
    reviews: 45,
    views: 6200,
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: "2024-11-28T08:30:00Z",
  },
  {
    id: "p4",
    name: 'LG OLED TV 55" C3 Series',
    sku: "LG-55C3-OLED",
    category: "electronics",
    price: 18900000,
    costPrice: 14200000,
    stock: 5,
    sold: 12,
    revenue: 226800000,
    profit: 56400000,
    margin: 24.9,
    status: "active",
    rating: 4.9,
    reviews: 18,
    views: 3400,
    createdAt: "2024-04-05T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p5",
    name: "Adidas Originals Hoodie",
    sku: "ADI-HUD-BLK-L",
    category: "clothing",
    price: 450000,
    costPrice: 280000,
    stock: 48,
    sold: 189,
    revenue: 85050000,
    profit: 32130000,
    margin: 37.8,
    status: "active",
    rating: 4.5,
    reviews: 112,
    views: 9800,
    createdAt: "2024-01-20T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p6",
    name: "Dyson V15 Detect Absolute",
    sku: "DYS-V15-ABS",
    category: "home",
    price: 7200000,
    costPrice: 5400000,
    stock: 3,
    sold: 8,
    revenue: 57600000,
    profit: 14400000,
    margin: 25.0,
    status: "active",
    rating: 4.8,
    reviews: 12,
    views: 2100,
    createdAt: "2024-05-15T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p7",
    name: "Loreal Revitalift Serum 30ml",
    sku: "LOR-RVTLFT-30",
    category: "beauty",
    price: 185000,
    costPrice: 95000,
    stock: 112,
    sold: 342,
    revenue: 63270000,
    profit: 30780000,
    margin: 48.6,
    status: "active",
    rating: 4.4,
    reviews: 198,
    views: 15600,
    createdAt: "2024-02-20T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p8",
    name: "Apple AirPods Pro 2nd Gen",
    sku: "APL-APP-2ND",
    category: "electronics",
    price: 2890000,
    costPrice: 2100000,
    stock: 15,
    sold: 56,
    revenue: 161840000,
    profit: 44240000,
    margin: 27.3,
    status: "active",
    rating: 4.9,
    reviews: 67,
    views: 11200,
    createdAt: "2024-03-01T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
  {
    id: "p9",
    name: "Protein Shake Whey Gold 2kg",
    sku: "PRTN-WHY-2KG",
    category: "sports",
    price: 380000,
    costPrice: 220000,
    stock: 0,
    sold: 12,
    revenue: 4560000,
    profit: 1920000,
    margin: 42.1,
    status: "paused",
    rating: 3.2,
    reviews: 8,
    views: 620,
    createdAt: "2024-08-10T10:00:00Z",
    updatedAt: "2024-11-15T08:30:00Z",
  },
  {
    id: "p10",
    name: "Tefal Easy Fry Air Fryer 4.2L",
    sku: "TFL-EF-4.2L",
    category: "home",
    price: 1290000,
    costPrice: 890000,
    stock: 22,
    sold: 78,
    revenue: 100620000,
    profit: 31200000,
    margin: 31.0,
    status: "active",
    rating: 4.6,
    reviews: 54,
    views: 8900,
    createdAt: "2024-04-12T10:00:00Z",
    updatedAt: "2024-12-01T08:30:00Z",
  },
];

// ─── Orders ───────────────────────────────────────────────────────────────────
const cities = ["Toshkent", "Samarqand", "Namangan", "Andijon", "Buxoro", "Nukus"];
const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
const paymentMethods = ["card", "cash", "uzum_pay"] as const;

export const mockOrders: Order[] = Array.from({ length: 48 }, (_, i) => {
  const status = statuses[i % statuses.length];
  const total = Math.floor(Math.random() * 8000000 + 200000);
  const commission = Math.floor(total * 0.12);
  return {
    id: `ord-${String(i + 1).padStart(4, "0")}`,
    orderNumber: `UZM-${String(2024001 + i)}`,
    customer: {
      name: ["Alisher Karimov", "Dilnoza Yusupova", "Bobur Toshmatov", "Malika Rahimova", "Jasur Nazarov", "Feruza Xoliqova"][i % 6],
      phone: `+998 9${Math.floor(Math.random() * 9 + 1)} ${String(Math.floor(Math.random() * 9000000 + 1000000)).replace(/(\d{3})(\d{2})(\d{2})/, "$1 $2 $3")}`,
      address: `Ko'cha ${i + 1}, Uy ${Math.floor(Math.random() * 50 + 1)}`,
      city: cities[i % cities.length],
    },
    items: [
      {
        productId: `p${(i % 10) + 1}`,
        productName: mockProducts[i % 10].name,
        sku: mockProducts[i % 10].sku,
        quantity: Math.floor(Math.random() * 3 + 1),
        price: mockProducts[i % 10].price,
        total: mockProducts[i % 10].price * Math.floor(Math.random() * 3 + 1),
      },
    ],
    status,
    paymentMethod: paymentMethods[i % paymentMethods.length],
    subtotal: total,
    commission,
    total,
    profit: total - commission - Math.floor(total * 0.55),
    createdAt: new Date(Date.now() - i * 86400000 * 0.8).toISOString(),
    updatedAt: new Date(Date.now() - i * 86400000 * 0.4).toISOString(),
    trackingNumber: status === "shipped" || status === "delivered" ? `TRK${String(100000 + i)}` : undefined,
  };
});

// ─── Inventory ────────────────────────────────────────────────────────────────
export const mockInventory: InventoryItem[] = mockProducts.map((p) => ({
  id: `inv-${p.id}`,
  productId: p.id,
  productName: p.name,
  sku: p.sku,
  category: p.category,
  currentStock: p.stock,
  minStock: 10,
  maxStock: 200,
  reorderPoint: 15,
  unitCost: p.costPrice,
  totalValue: p.stock * p.costPrice,
  lastRestocked: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
  soldLast30Days: Math.floor(p.sold * 0.3),
  daysUntilStockout: p.stock === 0 ? 0 : Math.floor((p.stock / (p.sold / 30)) * 1),
  status: p.stock === 0 ? "out_of_stock" : p.stock < 10 ? "low_stock" : p.stock > 100 ? "overstock" : "in_stock",
}));

// ─── Notifications ────────────────────────────────────────────────────────────
export const mockNotifications: Notification[] = [
  {
    id: "n1",
    type: "error",
    category: "inventory",
    title: "Mahsulot tugadi",
    message: 'Nike Air Max 270 React mahsuloti omborda qolmadi. Zudlik bilan buyurtma bering.',
    isRead: false,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    actionLabel: "Buyurtma berish",
    actionHref: "/inventory",
  },
  {
    id: "n2",
    type: "success",
    category: "order",
    title: "Yangi buyurtma",
    message: "UZM-2024048 raqamli yangi buyurtma keldi. Jami: 4,890,000 UZS",
    isRead: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    actionLabel: "Ko'rish",
    actionHref: "/orders",
  },
  {
    id: "n3",
    type: "ai",
    category: "ai",
    title: "AI tavsiya",
    message: "Protein Shake Whey mahsuloti so'nggi 30 kunda 0 ta sotilgan. Bu mahsulotni ko'rib chiqing.",
    isRead: false,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    actionLabel: "Tahlil qilish",
    actionHref: "/ai",
  },
  {
    id: "n4",
    type: "warning",
    category: "inventory",
    title: "Kam qolgan mahsulot",
    message: "Xiaomi Redmi Note 13 Pro omborda 8 ta qoldi. Reorder point: 15 ta",
    isRead: false,
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    actionLabel: "Inventar",
    actionHref: "/inventory",
  },
  {
    id: "n5",
    type: "info",
    category: "finance",
    title: "Oylik hisob",
    message: "Noyabr oyi uchun to'lov 2,840,000 UZS miqdorida amalga oshirildi.",
    isRead: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "n6",
    type: "success",
    category: "order",
    title: "Rekord savdo!",
    message: "Bugun 42 ta buyurtma qabul qilindi. Bu so'nggi 30 kunning rekordi!",
    isRead: true,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "n7",
    type: "ai",
    category: "ai",
    title: "Narx optimizatsiyasi",
    message: "Samsung Galaxy A54 narxini 4,590,000 ga tushirish 23% ko'proq sotuv keltirishi mumkin.",
    isRead: true,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    actionLabel: "Ko'rish",
    actionHref: "/ai",
  },
  {
    id: "n8",
    type: "warning",
    category: "finance",
    title: "Komissiya oshdi",
    message: "Uzum Market elektronika kategoriyasida komissiya 12% dan 13% ga oshirildi.",
    isRead: true,
    createdAt: new Date(Date.now() - 345600000).toISOString(),
  },
];

// ─── Team members ─────────────────────────────────────────────────────────────
export const mockTeamMembers: TeamMember[] = [
  {
    id: "tm1",
    name: "Alisher Karimov",
    phone: "+998 91 750 05 67",
    email: "alisher@example.com",
    role: "owner",
    status: "active",
    joinedAt: "2024-01-01T00:00:00Z",
    lastActive: new Date(Date.now() - 600000).toISOString(),
    permissions: ["all"],
  },
  {
    id: "tm2",
    name: "Dilnoza Yusupova",
    phone: "+998 90 123 45 67",
    email: "dilnoza@example.com",
    role: "admin",
    status: "active",
    joinedAt: "2024-02-15T00:00:00Z",
    lastActive: new Date(Date.now() - 3600000).toISOString(),
    permissions: ["products", "orders", "finance", "inventory"],
  },
  {
    id: "tm3",
    name: "Bobur Toshmatov",
    phone: "+998 93 456 78 90",
    email: "bobur@example.com",
    role: "analyst",
    status: "active",
    joinedAt: "2024-04-10T00:00:00Z",
    lastActive: new Date(Date.now() - 86400000).toISOString(),
    permissions: ["analytics", "reports"],
  },
  {
    id: "tm4",
    name: "Malika Rahimova",
    phone: "+998 97 789 01 23",
    email: "malika@example.com",
    role: "viewer",
    status: "invited",
    joinedAt: "2024-12-01T00:00:00Z",
    permissions: ["analytics"],
  },
];

// ─── AI Insights ──────────────────────────────────────────────────────────────
export const mockAIInsights: AIInsight[] = [
  {
    id: "ai1",
    type: "dead_product",
    severity: "critical",
    title: "O'lik mahsulot aniqlandi",
    description:
      'Protein Shake Whey Gold 2kg so\'nggi 45 kunda atigi 3 ta sotilgan. Saqlash xarajatlari daromaddan oshib ketmoqda.',
    impact: "-180,000 UZS/oy (saqlash + omborxona)",
    recommendation: "Narxni 20-30% ga tushiring yoki mahsulotni promosiyaga qo'ying",
    potentialGain: 760000,
    affectedProduct: "Protein Shake Whey Gold 2kg",
    confidence: 94,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "ai2",
    type: "price_optimization",
    severity: "high",
    title: "Narx optimizatsiyasi imkoniyati",
    description:
      "Samsung Galaxy A54 raqobatchilardan 8% qimmat. Narxni tushirish sotuvni 34% oshirishi mumkin.",
    impact: "+4,200,000 UZS qo'shimcha daromad/oy",
    recommendation: "Narxni 4,890,000 dan 4,550,000 UZS ga tushiring",
    potentialGain: 4200000,
    affectedProduct: "Samsung Galaxy A54 5G 128GB",
    confidence: 87,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: "ai3",
    type: "stock_alert",
    severity: "high",
    title: "Kritik zaxira darajasi",
    description:
      "LG OLED TV 55\" C3 Series 5 ta qolgan. Joriy sotuv sur'atida 12 kunda tugaydi.",
    impact: "Potensial yo'qotilgan sotuv: 18,900,000 UZS/hafta",
    recommendation: "Zudlik bilan 20-30 dona buyurtma bering",
    potentialGain: 37800000,
    affectedProduct: 'LG OLED TV 55" C3 Series',
    confidence: 96,
    createdAt: new Date(Date.now() - 21600000).toISOString(),
  },
  {
    id: "ai4",
    type: "trend",
    severity: "medium",
    title: "Ko'tarilayotgan trend",
    description:
      "Air fryer kategoriyasi so'nggi 30 kunda 156% o'sdi. Sizda faqat 1 ta mahsulot bor.",
    impact: "Potensial bozor ulushi: 12,400,000 UZS/oy",
    recommendation: "Tefal va Philips air fryer modellarini assortimentga qo'shing",
    potentialGain: 12400000,
    confidence: 78,
    createdAt: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: "ai5",
    type: "opportunity",
    severity: "medium",
    title: "Cross-sell imkoniyati",
    description:
      "AirPods Pro sotib olganlarning 68% i telefon aksessuarlarini ham qidiradi.",
    impact: "Har bir buyurtmaga o'rtacha +450,000 UZS",
    recommendation: "AirPods Pro bilan birga telefon chexol va himoya shisha tavsiya qiling",
    potentialGain: 25200000,
    confidence: 82,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "ai6",
    type: "competitor",
    severity: "low",
    title: "Raqobatchi faoliyati",
    description:
      "Asosiy raqobatchi Dyson V15 ni 6,800,000 UZS ga tushirdi. Sizning narxingiz: 7,200,000 UZS.",
    impact: "Ko'rilishlar 18% kamaydi",
    recommendation: "Vaqtinchalik aksiya yoki qo'shimcha xizmat taklif qiling",
    potentialGain: 8600000,
    affectedProduct: "Dyson V15 Detect Absolute",
    confidence: 71,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
];

// ─── Reports ──────────────────────────────────────────────────────────────────
export const mockReports: Report[] = [
  {
    id: "r1",
    name: "Dekabr 2024 Savdo Hisoboti",
    type: "sales",
    format: "pdf",
    dateRange: { from: "2024-12-01", to: "2024-12-31" },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    size: "2.4 MB",
    status: "ready",
  },
  {
    id: "r2",
    name: "Noyabr Moliyaviy Hisobot",
    type: "finance",
    format: "excel",
    dateRange: { from: "2024-11-01", to: "2024-11-30" },
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    size: "1.8 MB",
    status: "ready",
  },
  {
    id: "r3",
    name: "Mahsulotlar Tahlili Q4",
    type: "products",
    format: "excel",
    dateRange: { from: "2024-10-01", to: "2024-12-31" },
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    size: "3.2 MB",
    status: "ready",
  },
  {
    id: "r4",
    name: "Inventar Hisoboti",
    type: "inventory",
    format: "csv",
    dateRange: { from: "2024-12-01", to: "2024-12-31" },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    size: "0.5 MB",
    status: "generating",
  },
  {
    id: "r5",
    name: "Buyurtmalar Statistikasi",
    type: "orders",
    format: "pdf",
    dateRange: { from: "2024-01-01", to: "2024-12-31" },
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    size: "4.1 MB",
    status: "ready",
  },
];

// ─── Helper formatters ────────────────────────────────────────────────────────
export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)} mlrd UZS`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)} mln UZS`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)} ming UZS`;
  }
  return `${amount.toLocaleString()} UZS`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  if (hours < 24) return `${hours} soat oldin`;
  if (days < 7) return `${days} kun oldin`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()}`;
}
