const express = require('express');
const userRouter = express.Router();
const userController = require(__dirname + '/../../controllers/user');
const User = require(__dirname + '/../../models/user');
const auth = require(__dirname + '/../../middlewares/auth');
const publicAuth = require(__dirname + '/../../middlewares/publicAuth');
const Newsfeed = require(__dirname + '/../../models/newsfeed');
const Comment = require(__dirname + '/../../models/comment');
const Follow = require(__dirname + '/../../models/follow');
const Post = require(__dirname + '/../../models/post');
const Notification = require(__dirname + '/../../models/notification');
const rateLimit = require('express-rate-limit');
const cache = require('memory-cache');
const multiparty = require('multiparty');
const fs = require('fs');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const queryString = require('query-string');

// 3 tries a minute
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 3
});

/**
 * @api {post} /api/user Create user
 * @apiName Create new user
 * @apiPermission admin
 * @apiGroup User
 *
 * @apiParam  {String} [userName] username
 * @apiParam  {String} [email] Email
 * @apiParam  {String} [phone] Phone number
 * @apiParam  {String} [status] Status
 *
 * @apiSuccess (200) {Object} mixed `User` object
 */
userRouter.post('/register', userController.validate('createUser'), userController.createUser);

userRouter.post('/follow/:userId', auth, userController.follow);

userRouter.post('/unfollow/:userId', auth, userController.unfollow);

userRouter.post('/charge', auth, userController.validate('charge'), userController.charge);

userRouter.post('/withdraw', auth, userController.validate('withdraw'), userController.withdraw);

userRouter.get('/posts', auth, userController.posts);

userRouter.post('/reset-password', userController.resetPassword);
userRouter.post('/confirm-password', limiter, userController.confirmPassword);

userRouter.post('/login', userController.validate('loginUser'), userController.login);

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
});

const BUCKET_NAME = 'giving-tree/user';

function generateHash(user) {
  let username = user.username;
  let version = (user.profileVersion || 0) + 1; // 0 is default
  const secret = 'givingtree';
  const hash = require('crypto')
    .createHmac('sha256', secret)
    .update(username.toLowerCase())
    .digest('hex');

  return `${hash}?ver=${version}`;
}

function generateHashHeader(user) {
  let username = user.username;
  let version = (user.headerVersion || 0) + 1; // 0 is default
  let currentDate = new Date().toString();
  const secret = 'givingtree';
  const hash = require('crypto')
    .createHmac('sha256', secret)
    .update(username.toLowerCase() + currentDate)
    .digest('hex');

  return `headers/${hash}?ver=${version}`;
}

function generateInlineHash(user) {
  let username = user.username;
  let currentDate = new Date().toString();
  const secret = 'givingtree';
  const hash = require('crypto')
    .createHmac('sha256', secret)
    .update(username.toLowerCase() + currentDate)
    .digest('hex');

  return `inline/${username}/${hash}`;
}

var upload = multer({
  fileFilter: function(req, file, cb) {
    var filetypes = /jpeg|jpg|png|svg|gif/;
    var mimetype = filetypes.test(file.mimetype);
    var extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb('Error: File upload only supports the following filetypes - ' + filetypes);
  },
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    acl: 'public-read',
    contentType: function(req, file, cb) {
      cb(null, file.mimetype);
    },
    key: function(req, file, cb) {
      if (file.fieldname === 'image') {
        cb(null, generateHash(req.user));
      } else if (file.fieldname === 'header') {
        cb(null, generateHashHeader(req.user));
      } else if (file.fieldname === 'inlineImage') {
        cb(null, generateInlineHash(req.user));
      }
    }
  })
});

userRouter.put(
  '/upload',
  auth,
  upload.fields([{ name: 'inlineImage', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      if (req.files.inlineImage) {
        if (req.files.inlineImage[0].location) {
          let url = req.files.inlineImage[0].location;
          return res.send({ message: 'successfully uploaded', url });
        }
      } else {
        return res.status(400).send({ message: 'no image passed in' });
      }
    } catch (err) {
      console.log('error: ', err);
      return res.status(400).send({ message: 'error while updating', error: err });
    }
  }
);

// update fields
userRouter.put(
  '/',
  auth,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'header', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      if (req.files.image) {
        if (req.files.image[0].location) {
          req.user.profilePictureUrl = req.files.image[0].location;
          req.user.profileVersion = (req.user.profileVersion || 0) + 1;
          await req.user.save();
        }
      }

      if (req.files.header) {
        if (req.files.header[0].location) {
          req.user.headerPictureUrl = req.files.header[0].location;
          req.user.headerVersion = (req.user.headerVersion || 0) + 1;
          await req.user.save();
        }
      }

      if (req.query.summary) {
        req.user.summary = req.query.summary;
        await req.user.save();
      }

      return res.send({ message: 'successfully updated profile' });
    } catch (err) {
      console.log('error: ', err);
      return res.status(400).send({ message: 'error while updating', error: err });
    }
  }
);

const newest = (a, b) => {
  return b.createdAt - a.createdAt;
};

const newestUpdate = (a, b) => {
  return b.upatedAt - a.upatedAt;
};

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

userRouter.get(
  '/:id/latest-activity',
  userController.validate('publicAuth'),
  publicAuth,
  async (req, res) => {
    try {
      const resPerPage = 10;
      const page = req.params.page || 1;

      // find posts made by the user
      let newsFeed = await Newsfeed.find({ ownerId: req.user._id, deleted: false })
        .skip(resPerPage * page - resPerPage)
        .limit(resPerPage)
        .exec();

      let compiledNewsfeed = [];

      // pull extra information about posts
      for (var i = 0; i < newsFeed.length; i++) {
        let entry = newsFeed[i];

        switch (entry.type) {
          case 'Post':
            let foundPost = await Post.findById(entry.postId);
            if (foundPost) {
              compiledNewsfeed.push(foundPost);
            }
            break;
          case 'Comment':
            let foundCommentParent = await Post.findById(entry.parentId);

            // comments is the current commend thread
            // parent is the parent comment or post of 'comments'
            // goal is to return the parent and the child comment
            let results = findCommentParent(entry.postId, foundCommentParent.comments, 'post');
            if (!results) {
              // post has been deleted but newsfeed exists
              // delete from newsfeed here and then break;
              let newsfeed = await Newsfeed.findOne({ postId: entry.postId, deleted: false });
              if (newsfeed) {
                newsfeed.deleted = true;
                await newsfeed.save();
              }

              break;
            }

            var [parentId, comments] = results;

            let parent;
            if (parentId == 'post') {
              parent = foundCommentParent;
            } else {
              parent = findComment(parentId, foundCommentParent.comments);
            }

            let childComment = comments.filter(comment => {
              return comment._id.toString() == entry.postId.toString();
            });

            // attach parent to child
            let commentObject = {
              type: 'Comment',
              voteTotal: childComment[0].voteTotal,
              upVotes: childComment[0].upVotes,
              downVotes: childComment[0].downVotes,
              children: childComment[0].children,
              comments: childComment[0].comments,
              _id: childComment[0]._id,
              content: childComment[0].content,
              postId: childComment[0].postId,
              username: childComment[0].username,
              updatedAt: childComment[0].updatedAt,
              createdAt: childComment[0].createdAt,
              parent
            };

            if (foundCommentParent) {
              compiledNewsfeed.push(commentObject);
            }
            break;
          default:
            break;
        }
      }

      const numOfResults = await Newsfeed.count({ ownerId: { $in: leaderList } });

      return res.send({
        newsfeed: compiledNewsfeed,
        currentPage: page,
        pages: Math.ceil(numOfResults / resPerPage),
        numOfResults
      });
    } catch (err) {
      console.log('error: ', err);
      return res.status(400).send({ message: 'error', detail: err });
    }
  }
);

userRouter.get(
  '/:id/pictures',
  userController.validate('publicAuth'),
  publicAuth,
  async (req, res) => {
    let user = {
      message: 'success!',
      _id: req.user._id,
      username: req.user.username,
      profilePictureUrl: req.user.profilePictureUrl,
      headerPictureUrl: req.user.headerPictureUrl
    };

    return res.send(user);
  }
);

userRouter.get('/:id', userController.validate('publicAuth'), publicAuth, async (req, res) => {
  let postFeed = cache.get(`postFeed_${req.user._id}`);

  if (!postFeed) {
    postFeed = await Post.find({
      authorId: req.user._id,
      published: true
    })
      .select({
        createdAt: 1,
        updatedAt: 1,
        upVotes: 1,
        downVotes: 1,
        text: 1,
        title: 1,
        categories: 1
      })
      .limit(10)
      .exec();

    cache.put(`postFeed_${req.user._id}`, postFeed, 10 * 60 * 1000);
  } else {
    console.log('cached');
  }

  const [
    commentFeed,
    upvotePosts,
    downvotePosts,
    upvoteComments,
    downvoteComments,
    followers,
    following
  ] = await Promise.all([
    await Comment.find({ authorId: req.user._id }).exec(),
    await Post.find({ upVotes: req.user._id })
      .sort({ createdAt: -1 })
      .exec(),
    await Post.find({ downVotes: req.user._id })
      .sort({ createdAt: -1 })
      .exec(),
    await Comment.find({ upVotes: req.user._id })
      .sort({ createdAt: -1 })
      .exec(),
    await Comment.find({ downVotes: req.user._id })
      .sort({ createdAt: -1 })
      .exec(),
    await Follow.find({ leaderId: req.user._id }).exec(),
    await Follow.find({ followerId: req.user._id }).exec()
  ]);

  let upvotesFeed = upvotePosts.concat(upvoteComments);
  let downvotesFeed = downvotePosts.concat(downvoteComments);

  upvotesFeed.sort((a, b) => newest(a, b));
  downvotesFeed.sort((a, b) => newest(a, b));
  commentFeed.sort((a, b) => newest(a, b));

  let feeds = {
    message: 'success!',
    _id: req.user._id,
    name: req.user.name,
    summary: req.user.summary,
    karma: req.user.karma,
    email: req.user.email,
    username: req.user.username,
    profileVersion: req.user.profileVersion || 0,
    headerVersion: req.user.headerVersion || 0,
    profilePictureUrl: req.user.profilePictureUrl,
    headerPictureUrl: req.user.headerPictureUrl,
    verified: req.user.verified,
    posts: postFeed,
    comments: commentFeed,
    upvotes: upvotesFeed,
    downvotes: downvotesFeed,
    followers,
    following,
    createdAt: req.user.createdAt
  };

  return res.send(feeds);
});

userRouter.post('/logout', auth, async (req, res) => {
  // Log user out of the application
  try {
    req.user.tokens = req.user.tokens.filter(token => {
      return token.token != req.token;
    });
    await req.user.save();
    res.send('successfully logged out!');
  } catch (error) {
    res.status(500).send(error);
  }
});

userRouter.post('/logoutall', auth, async (req, res) => {
  // Log user out of all devices
  try {
    req.user.tokens.splice(0, req.user.tokens.length);
    await req.user.save();
    res.send('successfully logged out all!');
  } catch (error) {
    res.status(500).send(error);
  }
});

userRouter.post('/clear-notifications', auth, async (req, res) => {
  // Log user out of all devices
  try {
    let notifications = await Notification.find({ to: req.user._id, seen: false }).exec();
    for (var i = 0; i < notifications.length; i++) {
      notifications[i].seen = true;
      await notifications[i].save();
    }

    res.send('successfully cleared notifications!');
  } catch (error) {
    res.status(400).send({ message: 'error while clearing notifications', error });
  }
});

userRouter.put('/seen', auth, async (req, res) => {
  try {
    let type = req.body.type;
    if (type === 'submit') {
      req.user.seenSubmitTutorial = true;
    }

    if (type === 'tutorial') {
      req.user.welcomeTutorial = true;
    }

    await req.user.save();
    return res.send('successfully updated');
  } catch (err) {
    return res.status(400).send({ message: 'error while updating seen', error: err });
  }
});

// can speed up this call
userRouter.get('/', auth, async (req, res) => {
  let result = cache.get(req.user._id);

  if (result) {
    res.status(200).json(result);
  } else {
    let notifications = await Notification.find({ to: req.user._id, seen: false })
      .populate('to')
      .populate('from')
      .exec();
    for (var i = 0; i < notifications.length; i++) {
      notifications[i].postId = await Newsfeed.findOne({
        postId: notifications[i].postId,
        deleted: false
      }).exec();
    }

    let draftsFeed = await Post.find({ draft: true, authorId: req.user._id }).exec();

    let returnObject = {
      username: req.user.username,
      name: req.user.name,
      profileVersion: req.user.profileVersion,
      headerVersion: req.user.headerVersion,
      email: req.user.email,
      createdAt: req.user.createdAt,
      drafts: draftsFeed,
      seenSubmitTutorial: req.user.seenSubmitTutorial,
      welcomeTutorial: req.user.welcomeTutorial,
      _id: req.user._id,
      notifications,
      message: 'success!'
    };

    cache.put(req.user._id, returnObject, 5 * 60 * 1000); // they update rates every 5 minutes

    res.status(200).json(returnObject);
  }
});

module.exports = userRouter;
