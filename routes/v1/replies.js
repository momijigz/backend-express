const express = require('express');
const repliesRouter = express.Router();
const auth = require(__dirname + '/../../middlewares/auth');
const replyController = require(__dirname + '/../../controllers/reply');

repliesRouter.post(
  '/:postId/comments/:commentId/replies',
  auth,
  replyController.validate('createReply'),
  replyController.createReply
);

module.exports = repliesRouter;
