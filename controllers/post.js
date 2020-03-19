const { body, param, validationResult } = require('express-validator/check');
const Post = require(__dirname + '/../models/post');
const Newsfeed = require(__dirname + '/../models/newsfeed');
const User = require(__dirname + '/../models/user');
const Follow = require(__dirname + '/../models/follow');
const mongoose = require('mongoose');
var io = require(__dirname + '/../mysockets');
const sendNotification = require(__dirname + '/../util/notification');

exports.deletePost = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    let { postsId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(postsId)) {
      return res.status(422).json({ message: `postsId ${postsId} doesn't exist` });
    }

    let posts = await Post.findOne({ _id: postsId });
    let newsfeed = await Newsfeed.findOne({ postId: postsId, deleted: false });

    if (posts) {
      posts.remove();
    }

    if (newsfeed) {
      newsfeed.remove();
    }

    if (!posts && !newsfeed) {
      return res.status(422).json({ message: `postsId ${postsId} doesn't exist` });
    }

    return res.status(200).json({ message: `successfully deleted ${postsId}` });
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json({ message: `error while deleting posts`, error: err });
  }
};

exports.createDraft = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const { categories, title, text } = req.body;

    const posts = await Post.create({
      categories: categories.split(','),
      title,
      text,
      authorId: req.user._id,
      username: req.user.username,
      draft: true,
      published: false
    });

    res.status(200).json(posts);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json(err);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postsId = req.params.postsId;

    const posts = await Post.findOne({ _id: postsId, authorId: user._id });
    const { categories, title, text } = req.body;
    posts.categories = categories;
    posts.title = title;
    posts.text = text;
    posts.draft = true;
    posts.published = false;

    await posts.save();

    res.status(200).json(posts);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json(err);
  }
};

exports.editPost = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postsId = req.params.postsId;

    const posts = await Post.findOne({ _id: postsId, authorId: user._id });
    const { categories, title, text } = req.body;
    posts.categories = categories;
    posts.title = title;
    posts.text = text;
    posts.draft = false;
    posts.published = true;

    await posts.save();

    res.status(200).json(posts);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json(err);
  }
};

exports.publishPost = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const user = req.user;
    const postsId = req.params.postsId;

    const posts = await Post.findOne({ _id: postsId, authorId: user._id });
    if (posts.draft === false || posts.published === true) {
      return res.status(400).send({ message: `posts ${postsId} has already been published` });
    }

    const { categories, title, text } = req.body;
    posts.categories = categories;
    posts.title = title;
    posts.text = text;

    posts.draft = false;
    posts.published = true;

    await posts.save();

    // easy quick reference in future
    await Newsfeed.create({
      ownerId: req.user._id,
      postId: posts._id,
      content: title,
      type: 'Post'
    });

    // get followers and send notification to all
    let followers = await Follow.find({ leaderId: req.user._id }).exec();
    let followerList = followers.map(follower => follower.followerId);
    for (var i = 0; i < followerList.length; i++) {
      let follower = await User.findById(followerList[i]._id).exec();
      sendNotification(follower, req.user, posts, 'New Post');
    }

    res.status(200).json(posts);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json(err);
  }
};

exports.validate = method => {
  switch (method) {
    case 'editPost':
    case 'saveDraft':
    case 'createDraft': {
      return [
        body('categories', `categories required`).exists(),
        body('title', 'title required').exists(),
        body('text').exists()
      ];
    }
    case 'deletePost': {
      return [param('postsId', 'postsId required').exists()];
    }
  }
};
