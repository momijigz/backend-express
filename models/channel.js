const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongooseAlgolia = require('mongoose-algolia');

// Channel model keeps tracks of different channels (think about them as individualized newsfeeds)

const channelModel = new Schema({
  type: { type: String, default: 'Comment' },
  authorId: { type: Schema.ObjectId, ref: 'User' },
  postId: { type: Schema.ObjectId, ref: 'Post' },
  username: { type: String, required: false },
  voteTotal: { type: Number, default: 0 },
  upVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  downVotes: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  createdAt: { type: Date },
  updatedAt: { type: Date },
  content: { type: String, required: true },
  comments: [this]
});

// Use a regular function here to avoid issues with this!
channelModel.pre('save', function(next) {
  const date = new Date();
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

channelModel.plugin(mongooseAlgolia, {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  debug: true,
  indexName: function(doc) {
    return `channel_${process.env.NODE_ENV}`;
  }
});

module.exports = mongoose.model('Channel', channelModel);
