const moment = require('moment-timezone');
const _ = require('lodash');

const Comment = require('../models/comment');
const Post = require('../models/post');
const NewsFeed = require('../models/newsfeed');
const User = require('../models/user');
const Notification = require('../models/notification');

const userSignups = async () => {
  const total = await User.count({});
  const users = await User.find({
    createdAt: {
      $gt: moment(new Date()).subtract(9, 'days'),
    }
  }, {
    _id: true,
    username: true,
    email: true,
    createdAt: true,
    name: true
  }).exec();

  const parsedUsers = users.map((u) => {
    const user = u.toObject();
    const { createdAt } = user;

    user.createdAtMoment = moment.utc(createdAt).tz('America/Los_Angeles');

    return user;
  });

  const groupedByDay = _.groupBy(parsedUsers, u => u.createdAtMoment.format('YYYY-MM-DD'));
  const groupedByHour = _.mapValues(groupedByDay, (users, dateStr) => {
    const byHour = _.groupBy(users, (el) => el.createdAtMoment.hour());

    return {
      date: dateStr,
      total: users.length,
      byHour,
    };
  });
  
  return {
    total,
    days: _.orderBy(_.values(groupedByHour), ['date'], ['desc']),
  };
};

const requests = async () => {
  const total = await Post.count({});
  const claimed = await Post.count({ assignedUser: { $exists: true } });
  const completed = await Post.count({ completed: true });
  const released = await Post.count({ 'cancelTaskerReason.0': { $exists: true } });

  return {
    total,
    claimed,
    completed,
    released,
  };
};

const all = async (req, res, next) => {
  const data = await Promise.all([
    userSignups(),
    requests(),
  ]);

  res.json(
    _.zipObject(
      [
        'userSignups',
        'requests',
      ],
      data
    )
  );
};

module.exports = {
  userSignups,
  all,
};
