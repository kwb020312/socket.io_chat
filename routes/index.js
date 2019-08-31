const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Room = require('../schemas/room');
const Chat = require('../schemas/chat');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rooms = await Room.find({});
    res.render('main', { rooms, title: 'GIF 채팅방', error: req.flash('roomError') });
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/room', (req, res) => {
  res.render('room', { title: 'GIF 채팅방 생성' });
});

router.post('/room', async (req, res, next) => {
  try {
    const room = new Room({
      title: req.body.title,
      max: req.body.max,
      owner: req.session.color,
      password: req.body.password,
    });
    const newRoom = await room.save();
    const io = req.app.get('io');
    io.of('/room').emit('newRoom', newRoom);
    res.redirect(`/room/${newRoom._id}?password=${req.body.password}`);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.get('/room/:id', async (req, res, next) => {
  try {
    const room = await Room.findOne({ _id: req.params.id });
    const io = req.app.get('io');
    if (!room) {
      req.flash('roomError', '존재하지 않는 방입니다.');
      return res.redirect('/');
    }
    if (room.password && room.password !== req.query.password) {
      req.flash('roomError', '비밀번호가 틀렸습니다.');
      return res.redirect('/');
    }
    const { rooms } = io.of('/chat').adapter;
    if (rooms && rooms[req.params.id] && room.max <= rooms[req.params.id].length) {
      req.flash('roomError', '허용 인원이 초과하였습니다.');
      return res.redirect('/');
    }
    const chats = await Chat.find({ room: room._id }).sort('createdAt');
    return res.render('chat', {
      room,
      title: room.title,
      chats,
      number: (rooms && rooms[req.params.id] && rooms[req.params.id].length + 1) || 1,
      user: req.session.color,
    });
  } catch (error) {
    console.error(error);
    return next(error);
  }
});

router.delete('/room/:id', async (req, res, next) => {
  try {
    await Room.remove({ _id: req.params.id });
    await Chat.remove({ room: req.params.id });
    res.send('ok');
    setTimeout(() => {
      req.app.get('io').of('/room').emit('removeRoom', req.params.id);
    }, 2000);
  } catch (error) {
    console.error(error);
    next(error);
  }
});

router.post('/room/:id/chat', async (req, res, next) => {
  try {
    const chat = new Chat({
      room: req.params.id,
      user: req.session.color,
      chat: req.body.chat,
    });
    await chat.save();
    // req.app.get('io').of('/chat').to(req.params.id).emit('chat', chat);
    req.app.get('io').of('/chat').to(req.params.id).emit('chat',{
      socket: req.body.sid,
      room: req.params.id,
      user: req.session.color,
      chat: req.body.chat,
    });
    res.send('ok');
  } catch (error) {
    console.error(error);
    next(error);
  }
});

fs.readdir('uploads', (error) => {
  if (error) {
    console.error('uploads 폴더가 없어 uploads 폴더를 생성합니다.');
    fs.mkdirSync('uploads');
  }
});
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, 'uploads/');
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, path.basename(file.originalname, ext) + new Date().valueOf() + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});
router.post('/room/:id/gif', upload.single('gif'), async (req, res, next) => {
  try {
    const chat = new Chat({
      room: req.params.id,
      user: req.session.color,
      gif: req.file.filename,
    });
    await chat.save();
    // req.app.get('io').of('/chat').to(req.params.id).emit('chat', chat);
    req.app.get('io').of('/chat').to(req.params.id).emit('chat',{
      socket: req.body.sid,
      room: req.params.id,
      user: req.session.color,
      gif: req.file.filename,
    });
    res.send('ok');
  } catch (error) {
    console.error(error);
    next(error);
  }
});
router.post('/room/:id/sys', async(req, res, next) => {
  try {
    const chat = req.body.type === 'join'
      ? `${req.session.color} 님이 입장하셨습니다.`
      : `${req.session.color} 님이 퇴장하셨습니다.`;
    const sys = new Chat({
      room: req.params.id,
      user: 'system',
      chat,
    });
    await sys.save();
    req.app.get('io').of('/chat').to(req.params.id).emit(req.body.type, {
      user: 'system',
      chat,
      number: req.app.get('io').of('/chat').apdapter.rooms[req.params.id].length,
    });
    res.send('ok');
  } catch (error) {
    console.log('------------------------------------');
    console.log(error);
    console.log('------------------------------------');
    next(error);
  }
});

module.exports = router;