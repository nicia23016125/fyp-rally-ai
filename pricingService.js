// services/pricingService.js
exports.calculateInvoice = (plan, months) => {
  const base = plan.price * months;
  const taxRate = 0.09;
  const tax = base * taxRate;
  const total = base + tax;

  return {
    planName: plan.name,
    months,
    unitPrice: plan.price,
    subtotal: base,
    tax: tax.toFixed(2),
    total: total.toFixed(2)
  };
};
