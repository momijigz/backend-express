const express = require('express');
const chalk = require('chalk');
const axios = require('axios');
const sgMail = require('@sendgrid/mail');
const Newsfeed = require(__dirname + '/../models/newsfeed');
const Follow = require(__dirname + '/../models/follow');
const Post = require(__dirname + '/../models/post');
const User = require(__dirname + '/../models/user');
const Comment = require(__dirname + '/../models/comment');
const Notification = require(__dirname + '/../models/notification');
const auth = require(__dirname + '/../middlewares/auth');
const optionalAuth = require(__dirname + '/../middlewares/optionalAuth');
const algoliasearch = require('algoliasearch');
const emoji = require('node-emoji');
const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_API_KEY);

const userIndex = client.initIndex(`user_${process.env.NODE_ENV}`);
const postIndex = client.initIndex(`post_${process.env.NODE_ENV}`);
const commentIndex = client.initIndex(`comment_${process.env.NODE_ENV}`);

userIndex.setSettings({
  searchableAttributes: ['username', 'email', 'name', 'summary'],
  attributesToHighlight: ['username', 'email', 'name', 'summary'],
  attributesToSnippet: ['username', 'email', 'name', 'summary']
});

commentIndex.setSettings({
  searchableAttributes: ['username', 'content'],
  attributesToHighlight: ['username', 'content'],
  attributesToSnippet: ['comment:10']
});

postIndex.setSettings({
  searchableAttributes: ['title', 'text', 'username', 'categories'],
  attributesToHighlight: ['title', 'text', 'username', 'categories'],
  attributesToSnippet: ['text:10']
});

// User.SyncToAlgolia().then(success => {
//   console.log(emoji.get('person_with_blond_hair'), chalk.green('synced Users with algolia, ', success));
// }).catch(error => {
//   console.log(chalk.red('failed to sync successfully...', error));
// });

// Comment.SyncToAlgolia().then(success => {
//   console.log(emoji.get('koala'), chalk.green('synced Comments with algolia, ', success));
// }).catch(error => {
//   console.log(chalk.red('failed to sync successfully...', error));
// });

// Post.SyncToAlgolia().then(success => {
//   console.log(emoji.get('notebook'), chalk.green('synced Posts with algolia, ', success));
// }).catch(error => {
//   console.log(chalk.red('failed to sync successfully...', error));
// });

const router = express.Router();
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

sgMail.setApiKey(process.env.SG_API_KEY);

const findComment = (id, comments) => {
  if (comments.length > 0) {
    for (var index = 0; index < comments.length; index++) {
      const comment = comments[index];
      if (comment._id.toString() == id.toString()) {
        return comment;
      }
      const foundComment = findComment(id, comment.comments);
      if (foundComment) {
        return foundComment;
      }
    }
  }
};

const findCommentParent = (id, comments, parentId = '') => {
  if (comments.length > 0) {
    for (var index = 0; index < comments.length; index++) {
      const comment = comments[index];
      if (comment._id.toString() == id.toString()) {
        return [parentId, comments];
      }
      const foundComment = findCommentParent(id, comment.comments, comment._id);
      if (foundComment) {
        return foundComment;
      }
    }
  }
};

router.get('/', async (req, res) => {
  res.send({
    message: `Welcome to Giving Tree. Production: ${process.env.NODE_ENV === 'PRODUCTION'}`
  });
});

router.get('/webhook', (req, res) => {
  let event;

  const sig = request.headers['stripe-signature'];

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      handlePaymentIntentSucceeded(paymentIntent);
      break;
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      handlePaymentMethodAttached(paymentMethod);
      break;
    // ... handle other event types
    default:
      // Unexpected event type
      return res.status(400).end();
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true });
});

// returns refreshed resource to client
router.get('/refresh/:postId', async (req, res) => {
  try {
    let entry = await Newsfeed.findOne({ postId: req.params.postId });
    if (!entry) {
      return res.status(422).json({ message: `resource ${req.params.postId} doesn't exist` });
    }

    // deleted entry, redirect to postId
    if (entry.deleted) {
      return res.redirect(`/refresh/${entry.parentId}`);
    }

    let compiledNewsfeed = [];
    // pull extra information about posts
    switch (entry.type) {
      case 'Post':
        let foundPost = await Post.findOne({ _id: entry.postId, draft: false, published: true });
        if (foundPost) {
          compiledNewsfeed.push(foundPost);
        } else {
          // no post but newsfeed exists - delete newsfeed
          entry.remove();
          return res.status(422).json({ message: `resource ${req.params.postId} doesn't exist` });
        }
        break;
      case 'Comment':
        let foundCommentParent = await Post.findById(entry.parentId);
        if (foundCommentParent) {
          var foundComment = findComment(entry.postId, foundCommentParent.comments);
          if (foundComment) {
            compiledNewsfeed.push(foundCommentParent);
          }
        } else {
          entry.remove();
          return res.status(422).json({ message: `resource ${req.params.postId} doesn't exist` });
        }
        break;
      default:
        break;
    }

    if (compiledNewsfeed.length === 0) {
      entry.remove();
      return res.status(422).json({ message: `resource ${req.params.postId} doesn't exist` });
    }

    return res.status(200).send(compiledNewsfeed[0]);
  } catch (error) {
    console.log('error: ', error);
    return res.status(400).json({ message: 'error while refreshing', error });
  }
});

router.post('/socket', auth, async (req, res) => {
  try {
    let sessionId = req.body.sessionId;
    req.user.sessionId = sessionId;

    await req.user.save();

    console.log(chalk.green(`set user ${req.user.username} session id to ${sessionId}`));

    return res.send('success');
  } catch (error) {
    console.log('error: ', error);
    return res.status(400).send({ message: 'error while submitting feedback' });
  }
});

router.post('/feedback', auth, async (req, res) => {
  try {
    let mobile = '5072549154@tmomail.net';
    let personal = 'gavinmai@alumni.stanford.edu';
    const msg = {
      to: personal,
      from: 'feedback@givingtree.com',
      subject: `Feedback`,
      text: req.body.text
    };

    await sgMail.send(msg);
    return res.send('success');
  } catch (error) {
    console.log('error: ', error);
    return res.status(400).send({ message: 'error while submitting feedback' });
  }
});

// marking notifications as seen
router.post('/seen', auth, async (req, res) => {
  try {
    let postId = req.body.postId;
    let userId = req.body.userId;

    let notification = await Notification.findOne({
      to: userId,
      postId: postId,
      seen: false
    }).exec();
    if (!notification) {
      return res.status(400).send({ message: 'notification not found' });
    }

    notification.seen = true;
    notification.markModified('seen');

    await notification.save();

    return res.send('success');
  } catch (error) {
    console.log('error: ', error);
    return res.status(400).send({ message: 'error while registering seen' });
  }
});

// home feed
router.get('/home/:page', auth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    console.log('main home');

    let follows = await Follow.find({ followerId: req.user._id }).exec();
    let leaderList = follows.map(follow => follow.leaderId);

    let newsFeed = await Newsfeed.find({ ownerId: { $in: leaderList }, deleted: false })
      .sort({ updatedAt: -1 })
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
});

const formatSearchObject = async (results, type) => {
  let returnArray = [];
  let object = results[0].hits;

  for (var i = 0; i < object.length; i++) {
    let hit = object[i];

    switch (type) {
      case 'user':
        let userObject = {
          type: type,
          username: hit.username,
          name: hit.name,
          _id: hit.objectID,
          summary: hit.summary,
          image: await generateHash(hit.username)
        };

        if (hit._snippetResult.username.matchLevel === 'full') {
          userObject.label = hit._snippetResult.username.value;
          returnArray.push(userObject);
        }

        if (hit._snippetResult.email.matchLevel === 'full') {
          userObject.label = hit._snippetResult.email.value;
          returnArray.push(userObject);
        }

        if (hit._snippetResult.name.matchLevel === 'full') {
          userObject.label = hit._snippetResult.name.value;
          returnArray.push(userObject);
        }

        if (hit._snippetResult.summary && hit._snippetResult.summary.matchLevel === 'full') {
          userObject.label = hit._snippetResult.summary.value;
          returnArray.push(userObject);
        }

        break;
      case 'post':
        let postObject = {
          type: type,
          username: hit.username,
          authorId: hit.authorId,
          title: hit.title,
          _id: hit.objectID,
          updatedAt: hit.updatedAt,
          createdAt: hit.createdAt,
          image: await generateHash(hit.username)
        };

        if (hit._snippetResult.text.matchLevel === 'full') {
          postObject.label = hit._snippetResult.text.value;
          returnArray.push(postObject);
        }
      default:
        break;
    }
  }

  return returnArray;
};

let seenObjects = {};
async function validImage(url) {
  try {
    if (seenObjects[url] === undefined) {
      console.log(chalk.yellow('from scratch'));
      let response = await axios.get(url);

      if (response.status === 200) {
        seenObjects[url] = true;
        return true;
      } else {
        seenObjects[url] = false;
        return false;
      }
    } else {
      console.log(chalk.green('from cache'));
      return seenObjects[url];
    }
  } catch (err) {
    seenObjects[url] = false;
    return false;
  }
}

async function generateHash(username) {
  const secret = 'givingtree';
  const hash = require('crypto')
    .createHmac('sha256', secret)
    .update(username.toLowerCase())
    .digest('hex');

  const valid = await validImage(`https://d1ppmvgsdgdlyy.cloudfront.net/user/${hash}`);
  return valid
    ? `https://d1ppmvgsdgdlyy.cloudfront.net/user/${hash}`
    : `https://d1ppmvgsdgdlyy.cloudfront.net/acacia.svg`;
}

// search function
router.get('/search', async (req, res) => {
  try {
    let query = req.query.q;

    if (query === '') {
      return res.send([]);
    }

    // compile search engine feed
    // this is where the magic happens
    // use AI at some point to reach through human knowledge and break it into coq statements -> machine readable logic
    const queries = [
      {
        indexName: `user_${process.env.NODE_ENV}`,
        query
      },
      {
        indexName: `post_${process.env.NODE_ENV}`,
        query
      }
    ];

    let returnArray = [];

    // perform 3 queries in a single API call:
    //  - 1st query targets index `categories`
    //  - 2nd and 3rd queries target index `products`
    let hits = await client.search(queries);
    let userHits = hits.results.filter(item => item.index === `user_${process.env.NODE_ENV}`);
    let postHits = hits.results.filter(item => item.index === `post_${process.env.NODE_ENV}`);

    let userResults = await formatSearchObject(userHits, 'user');
    let postResults = await formatSearchObject(postHits, 'post');

    returnArray = returnArray.concat(userResults).concat(postResults);

    return res.send(returnArray);
  } catch (err) {
    console.log('error: ', err);
    return res.status(400).send({ message: 'error while searching', error: err });
  }
});

router.get('/discover/:page', async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ updatedAt: -1 })
      .skip(resPerPage * page - resPerPage)
      .limit(resPerPage)
      .exec();

    let compiledNewsfeed = [];

    // pull extra information about posts
    for (var i = 0; i < newsFeed.length; i++) {
      let entry = newsFeed[i];

      switch (entry.type) {
        case 'Post':
          let query = {
            _id: entry.postId,
            completed: false
            // assignedUser: undefined
          };

          if (req.query.lng && req.query.lat) {
            query.loc = {
              $near: {
                $maxDistance: req.query.distanceMeter ? Number(req.query.distanceMeter) : 1000, // default is 1000 M or 1KM
                $geometry: {
                  type: 'Point',
                  coordinates: [Number(req.query.lng), Number(req.query.lat)] // needs to be an array [longitude, latitude]
                }
              }
            };
          }

          let foundPost = await Post.findOne(query);
          if (foundPost) {
            compiledNewsfeed.push(foundPost);
          }
          break;
        case 'Comment':
          break; // skip for now
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

router.get('/ongoing/:page', auth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ updatedAt: -1 })
      .skip(resPerPage * page - resPerPage)
      .limit(resPerPage)
      .exec();

    let compiledNewsfeed = [];

    // pull extra information about posts
    for (var i = 0; i < newsFeed.length; i++) {
      let entry = newsFeed[i];

      switch (entry.type) {
        case 'Post':
          let foundPost = await Post.findOne({
            _id: entry.postId,
            completed: false,
            assignedUser: req.user._id // assigned to the user authenticating
          });
          if (foundPost) {
            compiledNewsfeed.push(foundPost);
          }
          break;
        case 'Comment':
          break; // skip for now
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

router.get('/completed/:page', auth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ updatedAt: -1 })
      .skip(resPerPage * page - resPerPage)
      .limit(resPerPage)
      .exec();

    let compiledNewsfeed = [];

    // pull extra information about posts
    for (var i = 0; i < newsFeed.length; i++) {
      let entry = newsFeed[i];

      switch (entry.type) {
        case 'Post':
          let foundPost = await Post.findOne({
            _id: entry.postId,
            completed: true,
            assignedUser: req.user._id
          })
            .populate('assignedUser', 'name username email karma createdAt profilePictureUrl')
            .exec();

          if (foundPost) {
            compiledNewsfeed.push(foundPost);
          }
          break;
        case 'Comment':
          break; // skip for now
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

let filters = ['name', 'resetToken', 'verified', 'summary', 'password', 'tokens'];

router.get('/global/:page', optionalAuth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ updatedAt: -1 })
      .skip(resPerPage * page - resPerPage)
      .limit(resPerPage)
      .exec();

    let compiledNewsfeed = [];

    // pull extra information about posts
    for (var i = 0; i < newsFeed.length; i++) {
      let entry = newsFeed[i];

      switch (entry.type) {
        case 'Post':
          let foundPost = await Post.findOne({
            _id: entry.postId,
            completed: true
          })
            .populate('assignedUser', 'name username email karma createdAt profilePictureUrl')
            .exec();

          if (foundPost) {
            let showDetails = req.user ?
              (req.user._id.toString() === foundPost.assignedUser._id.toString() ||
              req.user._id.toString() === foundPost.authorId.toString()) : false;

            if (!showDetails) {
              foundPost.trackingDetails = undefined; // remove tracking details if neither creator nor fulfiller
            }

            console.log('foundPost: ', foundPost);

            compiledNewsfeed.push(foundPost);
          }
          break;
        case 'Comment':
          break; // skip for now
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

router.get('/newest/:page', auth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ createdAt: -1 })
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

// async function reset() {
//   let all = await User.find({}).exec();
//   all.map(async p => {
//     if (!p.headerPictureUrl) {
//       console.log('no header');
//       p.headerPictureUrl = 'https://d1ppmvgsdgdlyy.cloudfront.net/givingtree.jpg';
//       await p.save();
//     } else {
//       console.log('yes header: ', p.username, `, header: `, p.headerPictureUrl);
//     }
//   });
// }

// reset();

router.get('/popular/:page', auth, async (req, res) => {
  try {
    const resPerPage = 10;
    const page = req.params.page || 1;

    let newsFeed = await Newsfeed.find({ deleted: false })
      .sort({ updatedAt: -1 })
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

    const numOfResults = await Newsfeed.count({ deleted: false });

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
});

module.exports = router;
