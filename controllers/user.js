const PROD = process.env.NODE_ENV === 'PRODUCTION';
const { body, param, validationResult } = require('express-validator/check');
const passwordValidator = require('password-validator');
const User = require(__dirname + '/../models/user');
const Post = require(__dirname + '/../models/post');
const Newsfeed = require(__dirname + '/../models/newsfeed');
const Follow = require(__dirname + '/../models/follow');
const sgMail = require('@sendgrid/mail');
const withdrawMethod = require(__dirname + '/../models/withdrawalMethod');
const stripe_secret_key = PROD ? process.env.STRIPE_SECRET : process.env.STRIPE_SECRET_SANDBOX;
const stripe = require('stripe')(stripe_secret_key);
var schema = new passwordValidator();
sgMail.setApiKey(process.env.SG_API_KEY);
schema
  .is()
  .min(8)
  .is()
  .max(100)
  .has()
  .digits()
  .has()
  .uppercase()
  .has()
  .lowercase()
  .has()
  .symbols()
  .has()
  .not()
  .spaces();

const convertReadableAmount = number => {
  return (Number(number) / 100).toFixed(2);
};

// uploadFile(file, userId);

exports.login = async (req, res, next) => {
  const rememberMe = req.body.rememberMe.toString().toLowerCase() === 'true';
  User.findOne({ username: req.body.username.toLowerCase() }, function(err, user) {
    if (err) throw err;
    if (!user) return res.status(401).json({ message: `Incorrect email or password` });

    user.comparePassword(req.body.password, async function(err, isMatch) {
      if (err) next(err);
      if (isMatch) {
        const token = await user.generateAuthToken(rememberMe);
        return res.status(200).json({
          message: 'success!',
          email: user.email,
          username: user.username,
          token,
          _id: user._id
        });
      } else {
        return res.status(401).json({ message: 'Incorrect email or password' });
      }
    });
  });
};

exports.createUser = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      let errorArray = errors.array();
      let message = '';

      console.log('errorArray.length: ', errorArray.length);
      for (var i = 0; i < errorArray.length; i++) {
        let filler = ', ';
        if (errorArray.length - 1 === i) {
          filler = '.';
        }
        message += errorArray[i].msg + filler;
      }
      res.status(422).json({ message, errors: errors.array() });
      return;
    }

    const { username, password, email, name } = req.body;

    // force lower case so no confusion
    const user = await User.create({
      username: username.toLowerCase(),
      password,
      email: email.toLowerCase(),
      name,
      profilePictureUrl: 'https://d1ppmvgsdgdlyy.cloudfront.net/acacia.svg'
    });

    const token = await user.generateAuthToken(true);

    return res.status(200).json({
      message: 'success!',
      email: user.email,
      username: user.username,
      name: user.name,
      profilePictureUr: user.profilePictureUrl,
      balanceUS: user.balanceUSD,
      token,
      _id: user._id
    });
  } catch (err2) {
    return res.status(400).json(err2);
  }
};

exports.follow = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const userId = req.params.userId;

    if (userId == req.user._id) {
      return res.status(400).json({ message: 'you cannot follow yourself' });
    }

    await Follow.create({
      followerId: req.user._id,
      leaderId: userId
    });

    let foundUser = await User.findById(userId).exec();

    let postFeed = await Post.find({ authorId: foundUser._id }).exec();
    let commentFeed = await Newsfeed.find({ ownerId: foundUser._id, deleted: false }).exec();
    let followers = await Follow.find({ leaderId: foundUser._id }).exec();
    let following = await Follow.find({ followerId: foundUser._id }).exec();

    let feeds = {
      message: 'success!',
      _id: foundUser._id,
      name: foundUser.name,
      email: foundUser.email,
      username: foundUser.username,
      verified: foundUser.verified,
      profilePictureUrl: foundUser.profilePictureUrl,
      headerPictureUrl: foundUser.headerPictureUrl,
      posts: postFeed,
      comments: commentFeed,
      followers,
      following,
      createdAt: foundUser.createdAt
    };

    res.status(200).json(feeds);
  } catch (err) {
    console.log('err: ', err);
    res.status(400).json(err);
  }
};

exports.unfollow = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const userId = req.params.userId;
    console.log('unfollowing: ', userId);
    await Follow.findOne({
      followerId: req.user._id,
      leaderId: userId
    })
      .deleteOne()
      .exec();

    let foundUser = await User.findById(userId).exec();

    let postFeed = await Post.find({ authorId: foundUser._id }).exec();
    let commentFeed = await Newsfeed.find({ ownerId: foundUser._id, deleted: false }).exec();
    let followers = await Follow.find({ leaderId: foundUser._id }).exec();
    let following = await Follow.find({ followerId: foundUser._id }).exec();

    let feeds = {
      message: 'success!',
      _id: foundUser._id,
      name: foundUser.name,
      email: foundUser.email,
      username: foundUser.username,
      verified: foundUser.verified,
      profilePictureUrl: foundUser.profilePictureUrl,
      headerPictureUrl: foundUser.headerPictureUrl,
      posts: postFeed,
      comments: commentFeed,
      followers,
      following,
      createdAt: foundUser.createdAt
    };

    res.status(200).json(feeds);
  } catch (err) {
    res.status(400).json(err);
  }
};

exports.addBank = async (req, res, next) => {
  stripe.customers.createSource(
    'cus_GJMN3M7cl5riDM',
    { source: 'btok_1FmjfCAZkNfIjhvXLxNBGiWk' },
    function(err, bankAccount) {
      // asynchronously called
    }
  );
};

exports.createProduct = async (req, res, next) => {
  stripe.products.create(
    {
      name: 'Weekly Car Wash Service',
      type: 'service'
    },
    function(err, product) {
      // asynchronously called
    }
  );
};

exports.createPlan = async (req, res, next) => {
  stripe.plans.create(
    {
      nickname: 'Standard Monthly',
      product: '{{CAR_WASH_PRODUCT_ID}}',
      amount: 2000,
      currency: 'usd',
      interval: 'month',
      usage_type: 'licensed'
    },
    function(err, plan) {
      // asynchronously called
    }
  );
};

exports.startMonthlySubscription = async (req, res, next) => {
  const subscription = await stripe.subscriptions.create({
    customer: 'cus_G02hIo15n8CU1s',
    items: [{ plan: 'plan_FSDjyHWis0QVwl' }],
    expand: ['latest_invoice.payment_intent']
  });
};

exports.addCard = async (req, res, next) => {
  stripe.customers.createSource('cus_GJMNlaJ1mUNI1W', { source: 'tok_amex' }, function(err, card) {
    // asynchronously called

    // update customer with payment method
    stripe.customers.update(
      'cus_GJMBJb7yL8LtHm',
      {
        payment_method: 'pm_1FU2bgBF6ERF9jhEQvwnA7sX',
        invoice_settings: {
          default_payment_method: 'pm_1FU2bgBF6ERF9jhEQvwnA7sX'
        }
      },
      function(err, customer) {
        // asynchronously called
      }
    );
  });
};

exports.charge = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const amountUSD = Number(req.body.amount);
    const recipientId = req.body.recipientId;
    const recipient = await User.findById(recipientId);
    const token = req.body.token;

    stripe.charges.create(
      {
        amount: amountUSD,
        currency: 'usd',
        source: token,
        description: `Donation to ${recipient.name} - Giving Tree`
      },
      function(err, charge) {
        // charge;
        if (err) {
          return res.status(403).json({ error: 'error while charging', details: err });
        } else {
          return res
            .status(200)
            .json({ message: `succesfully charged ${convertReadableAmount(amountUSD)}` });
        }
      }
    );
  } catch (err2) {
    return res.status(403).json({ error: 'error while charging', details: err2 });
  }
};

exports.withdraw = async (req, res, next) => {
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const amountUSD = Number(req.body.amount);
    const withdrawMethodId = req.body.withdrawalMethodId;
    const withdrawalMethod = await withdrawMethod.findById(withdrawMethodId);
    const type = withdrawalMethod.type;
    // Create a payout to the specified recipient

    let payload = {
      amount: amountUSD, // amount in cents
      currency: 'usd',
      recipient: recipientId,
      statement_descriptor: 'JULY SALES'
    };

    if (type == 'bank') {
      payload.bank_account = withdrawMethodId;
    } else {
      payload.card = withdrawMethodId;
    }

    stripe.payouts.create(payload, function(err, payout) {
      // payout;
      if (err) {
        return res.status(403).json({ error: 'error while withdrawing', details: err });
      } else {
        return res
          .status(200)
          .json({ message: `succesfully withdrew ${convertReadableAmount(amountUSD)}` });
      }
    });
  } catch (err2) {
    return res.status(403).json({ error: 'error while withdrawing', details: err2 });
  }
};

exports.posts = async (req, res, next) => {
  try {
    let postFeed = await Post.find({ authorId: req.user._id }).exec();
    let commentFeed = await Newsfeed.find({ ownerId: req.user._id, deleted: false }).exec();

    let feeds = postFeed.concat(commentFeed);

    return res.send(feeds);
  } catch (err2) {
    return res.status(403).json({ error: 'error getting user posts', details: err2 });
  }
};

// step 1/2 to create and send reset token to user's email
exports.resetPassword = async (req, res, next) => {
  try {
    const userEmail = req.body.email;
    let user = await User.findOne({ email: userEmail });

    if (!user) {
      return res.send({ message: `We have sent an email to the address with instructions` });
    }

    let token = await user.generateResetToken();

    const msg = {
      to: user.email.toLowerCase(),
      from: 'noreply@givingtree.com',
      subject: `Your Password Reset Instructions [${new Date()}]`,
      text: `Hello!\n\nWe've gotten a request to reset your password.\n\nThe reset link in http://localhost:3001/reset-password/${token}.\n\nIf this wasn't you, please email support@givingtree.com immedietly.\n\nYour friends at Giving Tree.`
    };

    await sgMail.send(msg);

    return res.send({ message: `We have sent an email to the address with instructions` });
  } catch (err2) {
    return res.status(403).json({ error: 'error resetting user password', details: err2 });
  }
};

// step 2/2 to confirm reset token
exports.confirmPassword = async (req, res, next) => {
  try {
    let newPassword = req.body.password;
    let token = req.body.token;

    let user = await User.findOne({ resetToken: token });
    if (!user || !token || token === '' || token.length < 20) {
      // basic safeguards
      return res.status(422).send({ message: 'invalid or expired token' });
    }

    user.password = newPassword;
    user.resetToken = null; // dispose of token
    await user.save();

    return res.send({ message: 'password was successfully changed!' });
  } catch (err2) {
    console.log('error: ', err2);
    return res.status(403).json({ error: 'error getting user posts', details: err2 });
  }
};

exports.validate = method => {
  switch (method) {
    case 'createUser': {
      return [
        body('username', `username missing`).exists(),
        body('email', 'invalid email')
          .isEmail()
          .normalizeEmail(),
        body('password').custom(password => {
          if (!schema.validate(password))
            return Promise.reject(
              `password must be at least eight characters and include at least one of a lowercase character [a-z], uppercase character [A-Z], special character (such as '!'), a number [0-9], and no spaces`
            );

          // success
          return true;
        }),
        body('name', 'missing name').exists()
      ];
    }
    case 'loginUser': {
      return [body('username', `username missing`).exists(), body('password').exists()];
    }
    case 'charge': {
      return [
        body('recipientId', 'recipientId missing').exists(),
        body('amountUSD', `amount in USD required`).isNumeric(),
        body('token', 'charge token required').exists()
      ];
    }
    case 'publicAuth': {
      return [param('id', 'username required').exists()];
    }
    case 'withdraw': {
      return [
        body('amountUSD', `amount in USD required`).isNumeric(),
        body('recipientId').custom(async recipientId => {
          const recipientExists = await User.exists({ _id: recipientId });
          if (!recipientExists) return Promise.reject(`must pass in a valid recipientId`);

          // success
          return true;
        }),
        body('withdrawalMethodId').custom(async withdrawalMethodId => {
          const methodExists = await withdrawMethod.exists({ _id: withdrawalMethodId });
          if (!methodExists) return Promise.reject(`must pass in a valid withdrawalMethodId`);

          // success
          return true;
        })
      ];
    }
  }
};
