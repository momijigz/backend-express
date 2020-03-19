const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const uniqueValidator = require('mongoose-unique-validator');

const followModel = new Schema(
  {
    followerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    leaderId: { type: Schema.Types.ObjectId, required: true, ref: 'User' }
  },
  {
    collection: 'Follow'
  }
);

// require both followerId and leaderId to be unique
followModel.index({ followerId: 1, leaderId: 1 }, { unique: true });

followModel.plugin(uniqueValidator);

module.exports = mongoose.model('Follow', followModel);
