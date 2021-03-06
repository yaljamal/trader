'use strict';

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const room = require('./models/rooms-model');
const api = require('./routes/api');
const userRoute = require('./routes/user-route');
const postRoute=require('./routes/post-route.js');
const logRequest = require('./middleware/logger.js');
const timeRequest = require('./middleware/timestamp.js');
const notFound = require('./middleware/404.js');
const serverError = require('./middleware/500.js');
const app = express();
const server = http.createServer(app);
const io = socketIo.listen(server);
const formatMessage = require('../utils/messages');
const messages = require('./models/messages-model'); 
const SECRET = process.env.SECRET || 'ahmadkmal';
const botName = 'trader';
const manager = {};

app.use(express.static('./public'));
app.use('/docs', express.static('./docs'));
app.use(express.json());
app.use(morgan('dev'));
app.use(cors());
app.use(timeRequest);
app.use(logRequest);


// CLIENT CONNECTION
io.on('connection', socket => {
  
  console.log('new connection',socket.id);
  socket.on('joinRoom', async ({ token ,secondUser }) => {
    // console.log('client joined room',socket.id);
    const tokenObject = await jwt.verify(token, SECRET);
    const firstUser = tokenObject.username;
    manager[socket.id]=firstUser;// from token it should be
    const user =await room.userJoin(firstUser,secondUser);
    // console.log('client joined room before IF',user);

    if (user.firstUser==firstUser){
      user.firstSocket=socket.id;
    }else{
      user.secondSocket=socket.id;
    }
    // console.log('client joined room AFTER IF',user);

    await room.update(user._id,user);
    socket.join(user._id);
    // console.log('HIIIIIIII');
    socket.emit('joined', (user._id)); //emitting the client room
    
    // Welcome current user
    socket.emit('message', formatMessage(botName, 'Welcome to ChatCord!'));
    // get msg from db 
    let oldmsg = await messages.msgGet(user._id);
    console.log('past 20 msg -------------->',oldmsg);
    oldmsg.forEach(msg => {
      socket.emit('message', msg);
    });
    // Broadcast when a user connects

    socket.broadcast
      .to(user._id)
      .emit(
        'message',
        formatMessage(botName, `${user.secondUser} is online`),
      );

    // Send users and room info

    // io.to(user._id).emit('roomUsers', {
    //   room: user._id,
    //   users: room.get(user.room),
    // });
  });

  // Listen for chatMessage
  socket.on('chatMessage',async (payload) => {
    console.log('PAYLOAD: ',payload);
    let seen = false;
    const user = (await room.get(payload.room))[0];
    console.log('user',user);
    let username = user.firstSocket==socket.id?user.firstUser:user.secondUser;
    console.log('sender ---------->',username);


    messages.create({ roomId: user._id,
      sender: username,
      payload: payload.msg});
    io.to(payload.room).emit('message', formatMessage(username, payload.msg,seen));
    
    // io.to(payload.room).emit('message', payload.msg);
  });

  // CLIENT DISCONNECTION
  socket.on('disconnect', async() => {
    const user1 = await room.searchGet({firstSocket:socket.id});
    const user2 = await room.searchGet({secondSocket:socket.id});
    console.log('firrrrsttttt----->',user1);
    console.log('secooooond----->',user2);
    if (user1.length) {
      user1.forEach(room => {
        io.to(room._id).emit(
          'message',
          formatMessage(botName, `${manager[socket.id]}  is offline right now`),
        );
      });
    }
    if (user2.length){
      user2.forEach(room => {
        io.to(room._id).emit(
          'message',
          formatMessage(botName, `${manager[socket.id]}  is offline right now`),
        );
      });
    }
  });
});


app.use('', userRoute);
app.use('', api);
app.use('',postRoute);
app.use('*', notFound);
app.use(serverError);

module.exports = {
  server: server,
  start: (port) => {
    const PORT = port|| 3000;
    server.listen(PORT, () => console.log(`Listening on ${PORT}`));
  },
};
