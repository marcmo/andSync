var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var express = require('express'),
    fs = require('fs'),
    connect = require('connect'),
    form = require('connect-form'),
    jquery = require("jquery"),
    formidable = require('formidable'),
    incomingForm = new formidable.IncomingForm(),
    jade = require('jade'),
    // app = module.exports = express.createServer(),
    app = module.exports = express.createServer(form({ keepExtensions: true })),
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

global.UPLOADDIR = path.join(__dirname, 'uploadDir');
global.p = function() {
  util.error(util.inspect.apply(null, arguments));
};

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.cookieParser());
  app.use(express.session({ store: mongoStore(app.set('db-uri')), secret: 'andsyncsecret' }));
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
  app.set('db-uri', 'mongodb://localhost/andsync-dev');
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.set('db-uri', 'mongodb://localhost/andsync-production');
  app.use(express.errorHandler()); 
});

// authentication
function authenticateUsingLoginToken(req, res, next) {
  logger.debug("authenticateUsingLoginToken"); 
  var cookie = JSON.parse(req.cookies.logintoken);

  LoginToken.findOne({ email: cookie.email,
                       series: cookie.series,
                       token: cookie.token }, (function(err, token) {
    if (!token) {
      logger.debug("...token not found for: " + req.cookies.logintoken); 
      res.redirect('/sessions/new');
      return;
    }

    User.findOne({ email: token.email }, function(err, user) {
      if (user) {
        logger.debug("...found user for token"); 
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
        logger.debug("...no user found for token"); 
        res.redirect('/sessions/new');
      }
    });
  }));
}

function requiresLogin(req, res, next) {
  logger.debug("requiresLogin middleware, req.session.user_id=" + req.session.user_id);
  if (req.session.user_id) {
    logger.debug("session found..."); 
    User.findById(req.session.user_id, function(err, user) {
      if (user) {
        logger.debug("valid user for sessions"); 
        req.currentUser = user;
        global.currentUser = user;
        next();
      } else {
        logger.debug("no user found for session"); 
        res.redirect('/sessions/new');
      }
    });
  } else if (req.cookies.logintoken) {
    logger.debug("no session but found logintoken"); 
    authenticateUsingLoginToken(req, res, next);
  } else {
    logger.debug("no session, no logintoken"); 
    res.redirect('/sessions/new');
  }
}

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

// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'Express'
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

app.get('/upload/new', function(req, res) {
  logger.debug("GET /upload/new");
  res.render('mp3/upload.jade', {
    locals: { upload: {} }
  });
});

//TODO reactivate login...but does not seem to work like this..
// app.post('/upload.:format?', requiresLogin, function(req, res) {
app.post('/upload.:format?', function(req, res) {
  logger.debug("upload for user:" + global.currentUser.email);
  var incomingForm = new formidable.IncomingForm(),
  files = [],
  currentFile;

  incomingForm.uploadDir = UPLOADDIR;
  incomingForm.keepExtensions = true;

	incomingForm
    .on('error', function(err) {
			logger.debug("error on upload:" + err);
      res.writeHead(200, {'content-type': 'text/plain'});
      res.end('error:\n\n'+util.inspect(err));
  }).on('file', function(field, file) {
			logger.debug("was a file in upload::" + file.filename);
			files.push([field, file]);
			currentFile = file;
  }).on('progress', function(received, expected) {
      var progress = (received / expected * 100).toFixed(2);
      var mb = (expected / 1024 / 1024).toFixed(1);
      logger.debug("received/expected:" + received + " - " + expected);
      logger.debug("Uploading "+mb+"mb ("+progress+"%)\015");
  }).on('end', function() {
			logger.debug('-> upload done');
			// res.writeHead(200, {'content-type': 'text/plain'});
			var responseObject = [];
			jquery.map(files, function(f){
				responseObject.push({name:f[1].filename,size:f[1].length});
			});
			if (!currentFile){
				return;
			}
			fs.rename(currentFile.path,
				path.join(UPLOADDIR,currentFile.filename),
				function(){
					saveNewItemForUser(req, res, global.currentUser, currentFile.filename, function(){
						res.redirect('/mp3s');
					});
				}
      );
	});
  incomingForm.parse(req);
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

app.get('/mp3s', requiresLogin, function(req, res){
  logger.debug("try to list mp3s of users:" + req.currentUser.email +
      ", salt:" + req.currentUser.salt +
      ", item_ids.length:" + req.currentUser.item_ids.length +
      ", hashed_password:" + req.currentUser.hashed_password);
  var mp3Ids = req.currentUser.item_ids;
  // find out names of all those mp3s
  asyncUtil.asyncMapWithError(
     mp3Ids,
     function(x,cb){
       MusicItem.findOne({'_id': x}, cb);
     },
     function(err, mp3Names){
       logger.debug('result was again, x=' + JSON.stringify(mp3Names));
       res.render('music/mp3list', {
         title: 'Uploaded Files',
         locals: {mp3s: mp3Names}
       });
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
