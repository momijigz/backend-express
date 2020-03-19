const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-unique-validator');

const donationModel = new Schema({
  payer: { type: Schema.ObjectId, ref: 'User' },
  recipient: { type: Schema.ObjectId, ref: 'User' },
  amountUSD: { type: Number, required: true },
  stripeId: { type: String, required: true, unique: true },
  createdAt: { type: Date },
  updatedAt: { type: Date }
});

donationModel.plugin(uniqueValidator);

// Use a regular function here to avoid issues with this!
donationModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('Donation', donationModel);
