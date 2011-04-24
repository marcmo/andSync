
/**
 * Module dependencies.
 */

var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var express = require('express'),
    connect = require('connect'),
    jade = require('jade'),
    app = module.exports = express.createServer(),
    mongoose = require('mongoose'),
    mongoStore = require('connect-mongodb'),
    sys = require('sys'),
    util = require('util'),
    log4js = require('log4js')(),
    logger = log4js.getLogger("and"),
    models = require('./models'),
    asyncUtil = require("asyncUtil"),
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
  app.use(express.logger({ format: '\x1b[1m:method\x1b[0m \x1b[33m:url\x1b[0m :response-time ms' }));
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

function saveNewItemForUser(req, res, user, mp3, cb){
	if (!user){
		cb("user not found: " + req.params.name);
	} else {
		MusicItem.findOne({ 'name' : mp3 }, function(err,i){
			if (err){
				logger.debug("user query returned error:" + err);
				cb(err);
			} else {
				var item = (i !== null) ? i : new MusicItem();
				item.name = mp3;
				user.item_ids.push(item);
				item.save(function (err){
					if (err) {
						logger.debug("item save failed");
						cb("item save failed for " + req.params.name);
					} else {
						logger.debug("item saved");
						user.save(userSaved);
					}
				});
			}
		});
	}
	function userSaved(err) {
		if (err) {
			logger.warn("user save failed");
			cb("user save failed: " + req.params.name);
		} else {
			logger.debug("user saved");
			User.find ({}, function(err,users){
				cb(null);//no error occured
			});
		}
	}
}

app.post('/upload.:format?', requiresLogin, function(req, res) {
	logger.debug("new upload: " + util.inspect(req.body) + " for current user: " + req.currentUser.email);
	saveNewItemForUser(req,res,req.currentUser,req.body.upload.name, 
		function(err){
			if (err){
				logger.error("some error occured:" + err);
			} 
			res.redirect('/mp3s');
		});
});
app.post('/users.:format?', function(req, res) {
	logger.debug("trying to create new user: " + util.inspect(req.body.user));
  var user = new User(req.body.user);
  logger.debug("created new user..");

  function userSaveFailed() {
    req.flash('warn', 'Account creation failed');
    res.render('users/new.jade', {
      locals: { user: user }
    });
  }

  user.save(function(err) {
    if (err) {return userSaveFailed();}

    req.flash('notify', 'Your account has been created');
    logger.debug('the account has been created for ' + user.email);
		req.session.user_id = user.id;
		req.session.usermail = user.email;
    if (req.params.format === 'json'){
        res.send(user.toObject());
		} else {
			res.redirect('/mp3s');
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
app.get('/upload', requiresLogin, function(req, res){
	logger.debug("upload was activated for current user: " + req.currentUser.email);
  User.find({}, function(err, allUsers) {
		res.render('music/upload', {
			title: 'New Upload',
			locals: {upload: {}}
		});
	});
});
app.get('/mp3s', requiresLogin, function(req, res){
	logger.debug("try to list mp3s of users:" + req.currentUser.email +
			", salt:" + req.currentUser.salt +
			", item_ids.length:" + req.currentUser.item_ids.length +
			", hashed_password:" + req.currentUser.hashed_password);
	var mp3Ids = req.currentUser.item_ids;
	// find names of all those mp3s
  // asyncUtil.asyncMap(
			// mp3Ids,
			// function(mp3Id,cb){ MusicItem.find({ '_id' : mp3Id }, cb);},
  //     function(x){ logger.debug('result was again, x=' + util.inspect(x));});
  MusicItem.find({}, function(err, allMp3s) {
		res.render('music/mp3list', {
			title: 'Uploaded Files',
			locals: {mp3s: allMp3s}
		});
	});
});
app.get('/upload/new', function(req, res) {
	logger.debug("GET /upload/new");
  res.render('mp3/upload.jade', {
    locals: { upload: {} }
  });
});
app.get('/users/new', function(req, res) {
	logger.debug("GET /users/new");
  res.render('users/new.jade', {
    locals: { user: new User() }
  });
});
app.get('/user/:id', function(req, res){
		logger.debug("GET /user/:id");
    User.findOne({ 'email' : req.params.id }, function(err, user) {
      if (err){
        logger.debug("user query returned error:" + err);
        res.send('that was user ' + req.params.id);
      }
      res.send('user email:' + user.email);
    });
});

function authenticateUsingLoginToken(req, res, next) {
	logger.debug("authenticateUsingLoginToken"); 
  var cookie = JSON.parse(req.cookies.logintoken);

  LoginToken.findOne({ email: cookie.email,
                       series: cookie.series,
                       token: cookie.token }, (function(err, token) {
    if (!token) {
			logger.debug("authenticateUsingLoginToken, token not found for: " + req.cookies.logintoken); 
      res.redirect('/sessions/new');
      return;
    }

    User.findOne({ email: token.email }, function(err, user) {
      if (user) {
				logger.debug("authenticateUsingLoginToken, found user for token"); 
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
				logger.debug("authenticateUsingLoginToken, no user found for token"); 
        res.redirect('/sessions/new');
      }
    });
  }));
}

function requiresLogin(req, res, next) {
  logger.debug("requiresLogin middleware, req.session.user_id=" + req.session.user_id);
  if (req.session.user_id) {
		logger.debug("requiresLogin: session found..."); 
    User.findById(req.session.user_id, function(err, user) {
      if (user) {
				logger.debug("requiresLogin: found valid user for sessions"); 
        req.currentUser = user;
        next();
      } else {
				logger.debug("requiresLogin: no user found for session"); 
        res.redirect('/sessions/new');
      }
    });
  } else if (req.cookies.logintoken) {
		logger.debug("requiresLogin: no session but found logintoken"); 
    authenticateUsingLoginToken(req, res, next);
  } else {
		logger.debug("requiresLogin: no session, no logintoken"); 
    res.redirect('/sessions/new');
  }
}

app.get('/', requiresLogin, function(req, res) {
  res.redirect('/mp3s');
});

// Sessions
app.get('/sessions/new', function(req, res) {
  res.render('sessions/new.jade', {
    locals: { user: new User() }
  });
});

app.post('/sessions', function(req, res) {
	logger.debug("post for session:" + JSON.stringify(req.body));
  User.findOne({ email: req.body.user.email }, function(err, user) {
    if (user && user.authenticate(req.body.user.password)) {
			logger.debug("post for session,user seems authenticated");
      req.session.user_id = user.id;
      req.session.usermail = user.email;

      // Remember me
      if (req.body.remember_me) {
        var loginToken = new LoginToken({ email: user.email });
        loginToken.save(function() {
          res.cookie('logintoken', loginToken.cookieValue, { expires: new Date(Date.now() + 604800000), path: '/' });
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

app.get('/sessions/destroy', requiresLogin, function(req, res) {
	logger.debug("finish our session for current user: " + req.currentUser.email);
  if (req.session) {
    LoginToken.remove({ email: req.currentUser.email }, function() {});
    res.clearCookie('logintoken');
    req.session.destroy(function() {});
  } else {
		logger.error("no session here!!!");
	}
  res.redirect('/sessions/new');
});

models.defineModels(mongoose, function() {
  app.User = User = mongoose.model('User');
  app.LoginToken = LoginToken = mongoose.model('LoginToken');
  app.MusicItem = MusicItem = mongoose.model('MusicItem');
  mydatabase = mongoose.connect(app.set('db-uri'));
});

// Only listen on $ node app.js

if (!module.parent) {
  app.listen(3001);
	logger.info("Express server listening on port " + app.address().port);
}
