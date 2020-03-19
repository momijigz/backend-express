const socketio = require('socket.io')();
const chalk = require('chalk');
const User = require(__dirname + '/models/user');

module.exports.listen = function(app) {
  io = socketio.listen(app);

  exports.sockets = io.sockets;

  io.sockets.on('connection', socket => {
    console.log(chalk.yellow(`user connected on socket ${socket.id}`));

    socket.on('subscribeToNotifications', userId => {
      if (userId) {
        console.log(`subscribed to notifications for user ${userId}`);
      }
    });

    socket.on('disconnect', async () => {
      console.log(chalk.yellow(`Disconnected socket ${socket.id}`));
      let user = await User.findOne({ sessionId: socket.id }).exec();
      if (!user) {
          console.log(chalk.red(`user not found with session id: ${socket.id}`));
      } else {
          user.sessionId = '';
          await user.save();
          console.log(chalk.green(`user sessionId reset!`));
      }
    });

  });

  console.log(chalk.yellow('socket listening'));

  return io
};