
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
    log4js = require('log4js')(),
    logger = log4js.getLogger("and"),
    models = require('./models'),
    mydatabase,
    User,
    LoginToken,
    MusicItem,
    Settings = { development: {}, test: {}, production: {} };

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ store: mongoStore(app.set('db-uri')), secret: 'ultrasecret' }));
  app.use(express.logger({ format: '\x1b[1m:method\x1b[0m \x1b[33m:url\x1b[0m :response-time ms' }))
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
	app.dynamicHelpers(
		{
			session: function(req, res) { return req.session; },
			flash: function(req, res) { return req.flash(); }
		}
	);
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
    logger.debug(util.inspect(req.body.user));
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
app.get('/mp3s', loadUser, function(req, res){
	logger.debug("try to get all mp3s of current users...");
  MusicItem.find({}, function(err, allMp3s) {
		res.render('music/mp3list', {
			title: 'Uploaded Files',
			locals: {mp3s: allMp3s}
		});
	});
});
app.get('/users/new', function(req, res) {
  res.render('users/new.jade', {
    locals: { user: new User() }
  });
});
app.get('/user/:id', function(req, res){
    User.findOne({ 'email' : req.params.id }, function(err, user) {
      if (err){
        logger.debug("user query returned error:" + err);
        res.send('that was user ' + req.params.id);
      }
      res.send('user email:' + user.email);
    });
});
app.get('/user/:email/add/:id', loadUser, function(req,res) {
  logger.debug("user was:" + req.params.email);
  logger.debug("mp3 was:" + req.params.id);
  User.findOne({ 'email' : req.params.email }, function(err, user) {
    if (err){
      logger.debug("user query returned error:" + err);
      res.send(JSON.stringify(err));
    } else {
        MusicItem.findOne({ 'email' : req.params.id }, function(err,i){
          if (err){
            logger.debug("user query returned error:" + err);
            res.send(JSON.stringify(err));
          } else {
            var item = (i !== null) ? i : new MusicItem();
            item.name = req.params.id;
            if (user){
              user.item_ids.push(item);
              item.save(
                function (){ user.save(userSaved,userSaveFailed); },
                itemSaveFailed);
            } else {
              res.send("user not found: " + req.params.email);
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

function authenticateFromLoginToken(req, res, next) {
	logger.debug("authenticateFromLoginToken"); 
  var cookie = JSON.parse(req.cookies.logintoken);

  LoginToken.findOne({ email: cookie.email,
                       series: cookie.series,
                       token: cookie.token }, (function(err, token) {
    if (!token) {
			logger.debug("authenticateFromLoginToken, token not found for: " + req.cookies.logintoken); 
      res.redirect('/sessions/new');
      return;
    }

    User.findOne({ email: token.email }, function(err, user) {
      if (user) {
				logger.debug("authenticateFromLoginToken, found user for token"); 
        req.session.user_id = user.id;
        req.currentUser = user;

        token.token = token.randomToken();
        token.save(function() {
        	var exp = new Date(Date.now() + 2 * 604800000);
					logger.debug("...new token will expire: " + exp); 
          res.cookie('logintoken', token.cookieValue, { expires: exp, path: '/' });
          next();
        });
      } else {
				logger.debug("authenticateFromLoginToken, no user found for token"); 
        res.redirect('/sessions/new');
      }
    });
  }));
}

function loadUser(req, res, next) {
  logger.debug("loadUser middleware, req.session.user_id=" + req.session.user_id);
  if (req.session.user_id) {
		logger.debug("loadUser: session found..."); 
    User.findById(req.session.user_id, function(err, user) {
      if (user) {
				logger.debug("loadUser: found valid user for sessions"); 
        req.currentUser = user;
        next();
      } else {
				logger.debug("loadUser: no user found for session"); 
        res.redirect('/sessions/new');
      }
    });
  } else if (req.cookies.logintoken) {
		logger.debug("loadUser: no session but found logintoken"); 
    authenticateFromLoginToken(req, res, next);
  } else {
		logger.debug("loadUser: no session, no logintoken"); 
    res.redirect('/sessions/new');
  }
}

app.get('/', loadUser, function(req, res) {
  res.redirect('/mp3s')
});

// Sessions
app.get('/sessions/new', function(req, res) {
  res.render('sessions/new.jade', {
    locals: { user: new User() }
  });
});

app.post('/sessions', function(req, res) {
	logger.debug("post for session:" + req.body);
  User.findOne({ email: req.body.user.email }, function(err, user) {
    if (user && user.authenticate(req.body.user.password)) {
			logger.debug("post for session,user seems authenticated");
      req.session.user_id = user.id;
      req.session.usermail = user.email;

      // Remember me
      if (req.body.remember_me) {
        var loginToken = new LoginToken({ email: user.email });
        loginToken.save(function() {
          res.cookie('logintoken', loginToken.cookieValue, { expires: new Date(Date.now() + 2 * 604800000), path: '/' });
          res.redirect('/mp3s');
        });
      } else {
        res.redirect('/mp3s');
      }
    } else {
			logger.debug("post for session, Incorrect credentials");
      req.flash('warn', 'Login failed');
      res.redirect('/sessions/new');
    }
  }); 
});

app.get('/sessions/destroy', loadUser, function(req, res) {
	logger.debug("finish our session for current user: " + req.currentUser.email);
  if (req.session) {
    LoginToken.remove({ email: req.currentUser.email }, function() {});
    res.clearCookie('logintoken');
    req.session.destroy(function() {});
  }
  res.redirect('/sessions/new');
});

models.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.LoginToken = LoginToken = mongoose.model('LoginToken');
  app.MusicItem = MusicItem = mongoose.model('MusicItem');
  mydatabase = mongoose.connect(app.set('db-uri'));
})

// Only listen on $ node app.js

if (!module.parent) {
  app.listen(3001);
	logger.info("Express server listening on port " + app.address().port);
}
