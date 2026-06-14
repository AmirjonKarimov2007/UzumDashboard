"use client";

import { useState } from "react";
import {
  HelpCircle,
  Search,
  MessageSquare,
  Book,
  Video,
  Phone,
  Mail,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = [
    { id: "all", label: "Barchasi", icon: HelpCircle },
    { id: "getting-started", label: "Boshlash", icon: Book },
    { id: "orders", label: "Buyurtmalar", icon: FileText },
    { id: "products", label: "Mahsulotlar", icon: CheckCircle2 },
    { id: "payments", label: "To'lovlar", icon: Clock },
    { id: "technical", label: "Texnik", icon: AlertCircle },
  ];

  const faqs = [
    {
      id: 1,
      category: "getting-started",
      question: "Qanday qilib boshlashim mumkin?",
      answer: "Ro'yxatdan o'tish uchun telefon raqamingizni kiriting. SMS orqali kelgan kodni tasdiqlang va do'koningizni yarating.",
    },
    {
      id: 2,
      category: "getting-started",
      question: "Bir nechta do'kon yaratishim mumkinmi?",
      answer: "Ha! Pro va Enterprise tarif rejalarida cheksiz do'kon yaratishingiz mumkin. Free rejadada faqat bitta do'kon bo'ladi.",
    },
    {
      id: 3,
      category: "products",
      question: "Mahsulot qanday qo'shiladi?",
      answer: "Mahsulotlar sahifasiga o'ting, 'Yangi mahsulot' tugmasini bosing va kerakli ma'lumotlarni to'ldiring.",
    },
    {
      id: 4,
      category: "orders",
      question: "Buyurtmalarni qanday boshqaraman?",
      answer: "Bosh sahifada so'nggi buyurtmalar ro'yxati ko'rsatiladi. Har bir buyurtma holatini kuzatib borishingiz mumkin.",
    },
    {
      id: 5,
      category: "payments",
      question: "To'lov qanday qabul qilinadi?",
      answer: "Uzum to'lov tizimi orqali to'lovlar avtomatik qabul qilinadi. Pul hisobingizga tushgandan so'ng darhol ko'rsatiladi.",
    },
    {
      id: 6,
      category: "technical",
      question: "Ma'lumotlarim xavfsizmi?",
      answer: "Albatta! Barcha ma'lumotlar shifrlangan holda saqlanadi va qonunga muvofiq ishlaymiz.",
    },
  ];

  const filteredFaqs = faqs.filter(
    (faq) =>
      (selectedCategory === "all" || faq.category === selectedCategory) &&
      (searchQuery === "" ||
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-[#fafafa]">Yordam</h1>
        <p className="text-[#a1a1aa] mt-1">Savollaringizga javob toping</p>
      </div>

      {/* Quick Help Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickHelpCard
          title="Qo'llanma"
          description="To'liq qo'llanma"
          icon={Book}
          color="from-[#8b5cf6] to-[#a78bfa]"
        />
        <QuickHelpCard
          title="Video darsliklar"
          description="Video qo'llanmalar"
          icon={Video}
          color="from-[#10b981] to-[#34d399]"
        />
        <QuickHelpCard
          title="Qo'llab-quvvatlash"
          description="Bepul yordam"
          icon={MessageSquare}
          color="from-[#3b82f6] to-[#60a5fa]"
        />
        <QuickHelpCard
          title="Aloqa"
          description="Biz bilan bog'laning"
          icon={Phone}
          color="from-[#f59e0b] to-[#fbbf24]"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#71717a]" />
        <input
          type="text"
          placeholder="Savol qidirish..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-12 pl-12 pr-4 rounded-2xl bg-[#18181b] border border-[#27272a] text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all"
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              selectedCategory === cat.id
                ? "bg-[#5b21b6] text-white"
                : "bg-[#1c1c21] text-[#a1a1aa] hover:bg-[#0f0f16] hover:text-[#fafafa]"
            }`}
          >
            <cat.icon className="w-4 h-4" />
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* FAQs */}
      <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6">
        <h2 className="text-lg font-semibold text-[#fafafa] mb-6">Ko'p so'ralgan savollar</h2>

        <div className="space-y-3">
          {filteredFaqs.map((faq) => (
            <FAQItem key={faq.id} question={faq.question} answer={faq.answer} />
          ))}
        </div>

        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <HelpCircle className="w-12 h-12 text-[#71717a] mx-auto mb-4" />
            <p className="text-[#a1a1aa] mb-4">Savol topilmadi</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="text-[#8b5cf6] text-sm font-medium hover:underline"
            >
              Filterlarni tozalash
            </button>
          </div>
        )}
      </div>

      {/* Contact Support */}
      <div className="rounded-2xl bg-gradient-to-br from-[#5b21b6] to-[#7c3aed] p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold text-white mb-2">
              Yana yordam kerakmi?
            </h2>
            <p className="text-white/70">
              Bizning qo'llab-quvvatlash jamoamiz sizga yordam berishdan xursand.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-[#5b21b6] font-medium hover:bg-white/90 transition-colors">
              <MessageSquare className="w-4 h-4" />
              <span>Chat</span>
            </button>
            <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur text-white font-medium hover:bg-white/20 transition-colors">
              <Mail className="w-4 h-4" />
              <span>Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ContactCard
          icon={Phone}
          title="Telefon"
          value="+998 71 123 45 67"
          subtext="Dushanba-Juma, 9:00-18:00"
        />
        <ContactCard
          icon={Mail}
          title="Email"
          value="support@uzum.uz"
          subtext="24 soat ichida javob"
        />
        <ContactCard
          icon={FileText}
          title="Manzil"
          value="Toshkent sh."
          subtext="Amir Temur 1-ko'chasi"
        />
      </div>
    </div>
  );
}

function QuickHelpCard({
  title,
  description,
  icon: Icon,
  color,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="group p-5 rounded-2xl bg-[#0a0a0f] border border-[#27272a] hover:border-[#3f3f46] hover:shadow-xl hover:shadow-[#09090b]/50 transition-all duration-300 cursor-pointer">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-base font-semibold text-[#fafafa] mb-1">{title}</h3>
      <p className="text-sm text-[#71717a] mb-3">{description}</p>
      <div className="flex items-center gap-1 text-[#8b5cf6] text-sm font-medium group-hover:gap-2 transition-all">
        <span>Ochish</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[#18181b] rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#0f0f16]/50 transition-colors"
      >
        <span className="text-sm font-medium text-[#fafafa]">{question}</span>
        <ChevronRight
          className={`w-4 h-4 text-[#71717a] transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="p-4 pt-0 border-t border-[#18181b]">
          <p className="text-sm text-[#a1a1aa] leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

function ContactCard({
  icon: Icon,
  title,
  value,
  subtext,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-[#0a0a0f] border border-[#27272a] hover:border-[#3f3f46] transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-[#8b5cf6]/10">
          <Icon className="w-4 h-4 text-[#8b5cf6]" />
        </div>
        <span className="text-sm text-[#71717a]">{title}</span>
      </div>
      <p className="text-base font-medium text-[#fafafa] mb-1">{value}</p>
      <p className="text-xs text-[#71717a]">{subtext}</p>
    </div>
  );
}