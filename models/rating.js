const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ratingModel = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    rating: { type: Number, required: true },
    type: { type: String } // along which rating segment (originality, reproducibility, commericial viability)
  },
  {
    collection: 'Rating'
  }
);

ratingModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('Rating', ratingModel);
