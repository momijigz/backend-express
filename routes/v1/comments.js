const express = require('express');
const commentRouter = express.Router();
const auth = require(__dirname + '/../../middlewares/auth');
const commentController = require(__dirname + '/../../controllers/comment');
const replyController = require(__dirname + '/../../controllers/reply');

commentRouter.post(
  '/:postId/comments',
  auth,
  commentController.validate('createComment'),
  commentController.createComment
);

commentRouter.put('/:postId/comments/:commentId/update', auth, replyController.update);

commentRouter.delete('/:postId/comments/:commentId', auth, replyController.delete);

commentRouter.put('/:postId/comments/:commentId/vote-up', auth, replyController.upvote);

commentRouter.put('/:postId/comments/:commentId/vote-down', auth, replyController.downvote);

module.exports = commentRouter;
