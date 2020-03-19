const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationModel = new Schema(
  {
    to: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    from: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    postId: { type: Schema.Types.ObjectId, required: true, ref: 'NewsFeed' },
    action: { type: String },
    seen: { type: Boolean, default: false },
    createdAt: { type: Date }
  },
  {
    collection: 'Notification'
  }
);

notificationModel.pre('save', function(next) {
  const date = new Date();
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('Notification', notificationModel);
