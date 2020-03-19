const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const mongooseAlgolia = require('mongoose-algolia');

// Important Note about this Model!!!

// this model is just used a fast reference to comments.
// it does NOT contain comments of the relational chart between parents and children
// it is simply a fast reference to comments under different authors and the content, the postId and simple features like votes
// the goal is to speed up queries for wide searches and if a user wants to see a comment in more detail, we can generate that
// using the recursive function in the comment/reply controllers :)

// this Model also gets updated for the basic variables changes like views, up/down votes, additions and deletions.

const commentModel = new Schema({
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
commentModel.pre('save', function(next) {
  const date = new Date();
  if (!this.createdAt) {
    this.createdAt = date;
  }
  next();
});

commentModel.plugin(mongooseAlgolia, {
  appId: process.env.ALGOLIA_APP_ID,
  apiKey: process.env.ALGOLIA_API_KEY,
  debug: true,
  indexName: function(doc) {
    return `comment_${process.env.NODE_ENV}`;
  }
});

module.exports = mongoose.model('Comment', commentModel);
