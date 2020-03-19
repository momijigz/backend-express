const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-unique-validator');

const payoutModel = new Schema({
  userId: { type: Schema.ObjectId, ref: 'User' },
  withdrawalMethod: { type: Schema.ObjectId, ref: 'withdrawalMethod' },
  amountUSD: { type: Number, required: true },
  stripeId: { type: String, required: true, unique: true },
  createdAt: { type: Date },
  updatedAt: { type: Date }
});

payoutModel.plugin(uniqueValidator);

// Use a regular function here to avoid issues with this!
payoutModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('Payout', payoutModel);
