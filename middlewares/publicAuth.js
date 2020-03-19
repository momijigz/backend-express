const jwt = require('jsonwebtoken');
const User = require(__dirname + '/../models/user');

const publicAuth = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.id });
    if (!user) {
      return res.status(422).send({ message: `User doesn't exist` });
    }
    req.user = user;
    next();
  } catch (error) {
    console.log('error: ', error);
    let errorResponse = {};
    errorResponse.message = `User doesn't exist`;

    res.status(400).send(errorResponse);
  }
};

module.exports = publicAuth;
