import { classifyFinanceExpense, financeExpenseAmount } from './finance-sync.service';

describe('finance ledger helpers', () => {
  it('multiplies the per-unit payment price by quantity', () => {
    expect(financeExpenseAmount({ paymentPrice: 5_500, amount: 4 })).toBe(22_000);
    expect(financeExpenseAmount({ paymentPrice: -5_750, amount: 3 })).toBe(17_250);
  });

  it('separates warehouse storage from the remaining fines', () => {
    expect(classifyFinanceExpense({
      type: 'OUTCOME',
      source: 'Ombor',
      name: '6720761-sonli yukxat bo‘yicha qaytarishni saqlash xizmatlari uchun to‘lov',
    })).toBe('storage');
  });

  it('separates extension charges from the remaining fines', () => {
    expect(classifyFinanceExpense({
      type: 'OUTCOME',
      source: 'Uzum Market',
      name: 'Buyurtmani topshirish muddatini uzaytirish uchun jarima',
    })).toBe('extension');
  });

  it('recognises real penalties by their description', () => {
    expect(classifyFinanceExpense({
      type: 'OUTCOME',
      source: 'Uzum Market',
      name: 'Buyurtmani avtomatik ravishda bekor qilishga jarima [1129316375]',
    })).toBe('fine');
  });

  it('separates marketing and returned money', () => {
    expect(classifyFinanceExpense({
      type: 'OUTCOME',
      source: 'Marketing',
      name: 'Buyurtmalarni ko‘paytirish to‘lovi',
    })).toBe('marketing');
    expect(classifyFinanceExpense({
      type: 'INCOME',
      source: 'Logistika',
      name: "Logistika to'lovini qaytarish",
    })).toBe('refund');
  });
});
