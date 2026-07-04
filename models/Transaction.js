const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['sell', 'buy'], required: true },
    personName: { type: String, required: true, trim: true },
    product: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, enum: ['kg', 'quintal', 'gram'], required: true },
    date: { type: String, required: true } // stored as YYYY-MM-DD to match the frontend's <input type="date">
  },
  { timestamps: true }
);

// Convert quantity+unit to kg, and shape the doc the way the frontend expects
// (it reads t.id and t.qtyKg directly).
transactionSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    const factor = { kg: 1, quintal: 100, gram: 0.001 }[ret.unit] ?? 1;
    ret.qtyKg = ret.quantity * factor;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
