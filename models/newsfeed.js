const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const newfeedModel = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    postId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    content: { type: String }, // for quick reference
    parentId: { type: Schema.Types.ObjectId, ref: 'Post' },
    deleted: { type: Boolean, default: false }, // do not delete newsfeed because its important to redirect user if they try to access a deleted comment
    type: { type: String } // what type of post: post, comment
  },
  {
    collection: 'NewsFeed'
  }
);

newfeedModel.pre('save', function(next) {
  const date = new Date();
  this.updatedAt = date;
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

module.exports = mongoose.model('NewsFeed', newfeedModel);
