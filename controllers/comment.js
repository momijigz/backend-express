const { body, validationResult } = require('express-validator/check');
const Comment = require(__dirname + '/../models/comment');
const Post = require(__dirname + '/../models/post');
const NewsFeed = require(__dirname + '/../models/newsfeed');
const User = require(__dirname + '/../models/user');
const Notification = require(__dirname + '/../models/notification');
var io = require(__dirname + '/../mysockets');
const sendNotification = require(__dirname + '/../util/notification');

exports.createComment = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const { text } = req.body;
    const postId = req.params.postId;
    Post.findById(postId)
      .then(async post => {
        const author = req.user;

        const authorId = author._id;
        const username = author.username;

        const comment = await Comment.create({
          content: text,
          postId,
          authorId: authorId,
          username
        });

        // easy quick reference in future
        await NewsFeed.create({
          ownerId: authorId,
          postId: comment._id,
          content: text,
          parentId: postId,
          type: 'Comment'
        });

        post.comments.unshift(comment);
        post.save();

        let postAuthor = await User.findById(post.authorId).exec();

        sendNotification(postAuthor, author, comment, 'Comment');

        return res.status(200).json(post);
      })
      .catch(err => {
        console.log('err: ', err);
        return res.status(401).send({ error: 'Invalid Post ID' });
      });
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.validate = method => {
  switch (method) {
    case 'createComment': {
      return [body('text', `comment required`).exists()];
    }
  }
};
