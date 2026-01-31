// controllers/subspaymentController.js
const pricingService = require("../pricingService"); // root folder

// Inline plan data (matches viewsubscription.ejs)
const plans = [
  { id: 1, name: "Personal", price: 10, credit: 100, limit: 50, template: "Basic" },
  { id: 2, name: "Pro", price: 20, credit: 300, limit: 150, template: "All" },
  { id: 3, name: "Enterprise", price: 50, credit: 1000, limit: 500, template: "All" }
];

exports.subscribe = async (req, res) => {
  try {
    const { planId, months } = req.body;

    if (!planId || !months) return res.status(400).send("Plan ID and months are required");

    const plan = plans.find(p => p.id === Number(planId));
    if (!plan) return res.status(404).send("Plan not found");

    // Calculate invoice using pricingService
    const invoice = pricingService.calculateInvoice(plan, Number(months));

    // Render invoice page
    res.render("invoice", {
      orderId: "ORD" + Date.now(),
      transactionId: "TXN" + Math.floor(Math.random() * 1000000),
      invoice,
      totalAmount: invoice.total
    });
  } catch (err) {
    console.error("Subscription Error:", err);
    res.status(500).send("Internal Server Error");
  }
};
