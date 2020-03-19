// centralized notification function
const Post = require(__dirname + '/../models/post');
const Comment = require(__dirname + '/../models/comment');
const NewsFeed = require(__dirname + '/../models/newsfeed');
const User = require(__dirname + '/../models/user');
const Notification = require(__dirname + '/../models/notification');
var io = require(__dirname + '/../mysockets');

const findComment = (id, comments) => {
    if (comments.length > 0) {
      for (var index = 0; index < comments.length; index++) {
        const comment = comments[index];
        if (comment._id == id) {
          return comment;
        }
        const foundComment = findComment(id, comment.comments);
        if (foundComment) {
          return foundComment;
        }
      }
    }
  };

const sendNotification = async (author, currentUser, post, action) => {
    if (author && author._id.toString() !== currentUser._id.toString()) {
        let newNotification = await Notification.create({
          to: author._id,
          from: currentUser._id,
          postId: post._id,
          action: action,
          seen: false
        });

        if (io.sockets.sockets[author.sessionId]) {
          let notification = await Notification.findById(newNotification._id)
            .populate('to')
            .populate('from')
            .exec();

          notification.postId = await NewsFeed.findOne({ postId: notification.postId, deleted: false }).exec();

          io.sockets.sockets[author.sessionId].emit('notification', notification);
        }
      }
}

module.exports = sendNotification;