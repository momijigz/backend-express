const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-unique-validator');

// can be bank account or card
const withdrawalMethodModel = new Schema({
  payer: { type: Schema.ObjectId, ref: 'User' },
  recipient: { type: Schema.ObjectId, ref: 'User' },
  amountUSD: { type: Number, required: true },
  stripeId: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // type = bank or debit
  createdAt: { type: Date },
  updatedAt: { type: Date }
});

withdrawalMethodModel.plugin(uniqueValidator);

// Use a regular function here to avoid issues with this!
withdrawalMethodModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('withdrawalMethod', withdrawalMethodModel);
