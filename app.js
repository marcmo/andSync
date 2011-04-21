
/**
 * Module dependencies.
 */

var express = require('express'),
    connect = require('connect'),
    jade = require('jade'),
    app = module.exports = express.createServer(),
    mongoose = require('mongoose'),
    mongoStore = require('connect-mongodb'),
    sys = require('sys'),
    path = require('path'),
    util = require('util'),
    models = require('./models'),
    mydatabase,
    User,
    MusicItem,
    Settings = { development: {}, test: {}, production: {} };

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ store: mongoStore(app.set('db-uri')), secret: 'ultrasecret' }));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.set('db-uri', 'mongodb://localhost/mynodepad-development');
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.set('db-uri', 'mongodb://localhost/mynodepad-production');
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Express'
  });
});

app.post('/users.:format?', function(req, res) {
  var user = new User(req.body.user);

  function userSaveFailed() {
    req.flash('error', 'Account creation failed');
    res.render('users/new.jade', {
      locals: { user: user }
    });
  }

  user.save(function(err) {
    if (err) return userSaveFailed();

    req.flash('info', 'Your account has been created');

    switch (req.params.format) {
      case 'json':
        res.send(user.toObject());
      break;

      default:
        res.redirect('/users');
    }
  });
});
app.get('/users', function(req, res){
  User.find({}, function(err, allUsers) {
		res.render('users/userlist', {
			title: 'Registered Users',
			locals: {users: allUsers}
		});
	});
});
app.get('/users/new', function(req, res) {
  res.render('users/new.jade', {
    locals: { user: new User() }
  });
});
app.get('/user/:id', function(req, res){
    User.findOne({ 'name' : req.params.id }, function(err, user) {
      if (err){
        console.log("user query returned error:" + err);
        res.send('that was user ' + req.params.id);
      }
      res.send('user name:' + user.name);
    });
});
app.get('/user/:name/add/:id', function(req,res) {
  console.log("user was:" + req.params.name);
  console.log("mp3 was:" + req.params.id);
  User.findOne({ 'name' : req.params.name }, function(err, user) {
    if (err){
      console.log("user query returned error:" + err);
      res.send(JSON.stringify(err));
    } else {
        MusicItem.findOne({ 'name' : req.params.id }, function(err,i){
          if (err){
            console.log("user query returned error:" + err);
            res.send(JSON.stringify(err));
          } else {
            (i !== null) ?  console.log("item was present") : console.log("item was NOT present");
            var item = (i !== null) ? i : new MusicItem();
            item.name = req.params.id;
            if (user){
              user.item_ids.push(item);
              item.save(
                function (){ user.save(userSaved,userSaveFailed); },
                itemSaveFailed);
            } else {
              res.send("user not found: " + req.params.name);
            }

            function userSaved() {
              User.find ({}, function(err,users){
                res.send(JSON.stringify(users));
              });
            }
            function userSaveFailed() {
              res.render('users/new.jade', { locals: { user: user } });
            }
            function itemSaveFailed() {
              throw "saving of item failed";
            }
          }
      });
    }
  });
});

app.get('/user/new/:name', function(req,res) {
  console.log("user was:" + req.params.name);
  var user = new User();
  user.name = req.params.name;
  user.email = req.params.name + '@test.test';
  function userSaved() {
    User.find ({}, function(err,users){
      res.send(JSON.stringify(users));
    });
  }
  function userSaveFailed() {
    res.render('users/new.jade', {
      locals: { user: user }
    });
  }
  user.save(userSaved,userSaveFailed);
});


models.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.MusicItem = MusicItem = mongoose.model('MusicItem');
  mydatabase = mongoose.connect(app.set('db-uri'));
})

// Only listen on $ node app.js

if (!module.parent) {
  app.listen(3001);
  console.log("Express server listening on port %d", app.address().port);
}
