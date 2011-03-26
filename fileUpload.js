var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var fs = require('fs'),
    url = require("url"),
    futil = require('formidable/util'),
    http = require('http'),
    util = require('util'),
    formidable = require('formidable'),
    events = require("events"),
    jquery = require("jquery"),
    crypto = require("crypto"),
    cryptoHelper = require("cryptoHelper"),
    asyncUtil = require("asyncUtil"),
    log4js = require('log4js')(),
    logger = log4js.getLogger("and");

global.puts = futil.puts;
global.p = function() {
  futil.error(futil.inspect.apply(null, arguments));
};
global.PORT = 8080;
global.UPLOADDIR = path.join(__dirname, 'uploadDir');
global.USERDIR = path.join(__dirname, 'users');
global.USERS = [];
global.mp3Lists = {};

asyncUtil.ensureDirectory(UPLOADDIR, function() {
  asyncUtil.ensureDirectory(USERDIR, function() {
    fs.readdir(USERDIR,function (err,files){
      var paths = jquery.map(files,function(v){return path.join(USERDIR,v);});
      jquery.map(paths, function(v,i){
        var s = fs.statSync(v);
        if (s.isDirectory()) {
          USERS.push(path.basename(v));
        } 
      });
      logger.debug("known users: " + USERS);
      asyncUtil.asyncMap(USERS.slice(), // pass in a copy
          function(u,cb){ updateMp3List(u,cb); },
          startServer);
    });
  });
});

function serveStaticFile(uri, req, res) {
  var range = req.headers.range;
  var filename = path.join(process.cwd(), uri);
  path.exists(filename, function(exists) {
    if(!exists) {
      logger.warn(filename + " did not exist");
      res.writeHead(404, {"Content-Type": "text/plain"});  
      res.write("404 Not Found\n");  
      res.end();  
      return;  
    } 
    var fileStat = fs.statSync(filename);
    if (range){
      logger.debug("serving static file, was partial get with: " + range);
      var total = fileStat.size; 
      var parts = range.replace(/bytes=/, "").split("-"); 
      var partStart = parseInt(parts[0], 10); 
      var partEnd = parts[1] ? parseInt(parts[1], 10) : total-1; 
      var chunksize = partEnd-partStart; 
      logger.debug("start:" + partStart + ",end"+partEnd+" (total: "+total+")");
      res.writeHead(206, {
        "Content-Range": "bytes " + partStart + "-" + partEnd + "/" + total,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize
      }); 
      fs.createReadStream(filename,{'start' : partStart, 'end' : partEnd, 'flags': 'r',
																		'encoding': 'binary', 'mode': 0666, 'bufferSize': 16 * 1024})
        .addListener("data", function(chunk){
        	logger.debug("data chunk...");
          res.write(chunk, 'binary');
        })
        .addListener("close",function() {
        	logger.debug("close of read stream...");
          res.end();
        }); 
    } else {
			res.writeHead(200);  
      fs.createReadStream(filename,{'flags': 'r',
																		'encoding': 'binary', 'mode': 0666, 'bufferSize': 16 * 1024})
        .addListener("data", function(chunk){
          res.write(chunk, 'binary');
        })
        .addListener("close",function() {
        	logger.debug("close of read stream...");
          res.end();
        }); 
    }
  });  
}

function deleteSingleFile(user, uri, req, res) {
    if (mp3Lists[user]){
      path.exists(uri, function(exists) {
        if(!exists) {
          logger.warn(uri + " did not exist");
          res.write(JSON.stringify(mp3Lists[user].music));  
          res.end();  
          return;  
        } 
        fs.unlink(uri, function (err) {
            if (err) {throw err;}
            logger.debug('successfully deleted ' + uri);
            updateMp3List(user,function(){
                res.write(JSON.stringify(mp3Lists[user].music));  
                res.end();
            });
        });
      });
    } else {
      logger.warn("user " + user + " did not exist");
      res.write(JSON.stringify({}));  
    }
}

function startServer(){
  var server = http.createServer(function(req, res) {
    logger.debug("server: req:" + req.url);
    // logger.debug("server: req.header" + util.inspect(req.headers));
    if (req.url.match("^\/script")) {
      var uri = url.parse(req.url).pathname;  
      serveStaticFile(uri,req,res);
    } else if (req.url.match("^\/user\/")) {
      handleUserOperation(req,res);
    } else {
      res.writeHead(404, {'content-type': 'text/plain'});
      res.end('404');
    }
  });
  server.listen(PORT);
  util.puts('listening on http://localhost:'+PORT+'/');
}

function handleUserOperation(req,res){
  var uploadRegex = /\/user\/upload\/(.*)/i;
  var sha1Regex = /\/user\/sha1\/(.*)/i;
  var contentRegex = /\/user\/content\/(.*)/i;
  var clearRegex = /\/user\/clear\/(.*)/i;
  var getRegex = /\/user\/get\/(.*)\/(.*\.\w*)/i;
  var eraseUserRegex = /\/user\/erase\/(.*)/i;
  var deleteFileRegex = /\/user\/delete\/(.*)\/(.*\.\w*)/i;
  if (uploadRegex.test(req.url)) {
    var matchedUser = uploadRegex.exec(req.url)[1];
    logger.debug("was an upload for:" + matchedUser);
    handleUpload(req,res,matchedUser);
  } else if (sha1Regex.test(req.url)) {
    var matchedUser = sha1Regex.exec(req.url)[1];
    userSha1(req,res,matchedUser);
  } else if (contentRegex.test(req.url)) {
    var matchedUser = contentRegex.exec(req.url)[1];
    userContent(req,res,matchedUser);
  } else if (clearRegex.test(req.url)) {
    var matchedUser = clearRegex.exec(req.url)[1];
    var userDir = path.join('users',unescape(matchedUser));
    res.writeHead(200, { "Content-Type" : "text/plain" });  
    clearUserFiles(userDir,matchedUser,function(){
      res.write(JSON.stringify(mp3Lists[user].music));  
      res.end();
    });
  } else if (getRegex.test(req.url)) {
    var matchedUser = getRegex.exec(req.url)[1];
    var matchedMp3 = getRegex.exec(req.url)[2];
    var userDir = path.join('users',unescape(matchedUser));
    logger.debug("trying to fetch:" + matchedMp3 + " from " + matchedUser);
    serveStaticFile(path.join(userDir,unescape(matchedMp3)),req,res);
  } else if (eraseUserRegex.test(req.url)) {
    var matchedUser = eraseUserRegex.exec(req.url)[1];
    var userDir = path.join('users',unescape(matchedUser));
    eraseUser(req,res,userDir,unescape(matchedUser));
  } else if (deleteFileRegex.test(req.url)) {
    var matchedUser = deleteFileRegex.exec(req.url)[1];
    var matchedMp3 = deleteFileRegex.exec(req.url)[2];
    var userDir = path.join('users',unescape(matchedUser));
    logger.debug("trying to delete:" + matchedMp3 + " from " + matchedUser);
    deleteSingleFile(matchedUser,path.join(userDir,unescape(matchedMp3)),req,res);
  } else if (req.url == '/user/new') {
    createNewUser(req,res);
  } else if (req.url == '/user/list'){
    res.writeHead(200, { "Content-Type" : "text/plain" });  
    res.write(JSON.stringify(USERS));  
    res.end();  
  } else {
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('404');
  }
}

function userContent(req,res,user){
  res.writeHead(200, { "Content-Type" : "text/plain" });  
  if (mp3Lists[user]){
    logger.debug(mp3Lists);
    logger.debug('trying to read user:' + user + ',mp3List=' + mp3Lists);
    res.write(JSON.stringify(mp3Lists[user].music));  
  } else {
    logger.debug("usercontent, user " + user + " did not exist");
    res.write(JSON.stringify({}));  
  }
  res.end();  
}
function eraseUser(req,res,userDir,user){
  res.writeHead(200, { "Content-Type" : "text/plain" });  
  if (mp3Lists[user]){
    delete mp3Lists[user];
  }
  logger.debug("user to delete:" + user + ",users before: " + util.inspect(USERS));
  var i = USERS.lastIndexOf(user);
  if (i !== -1){
    USERS.splice(i,1);
  } else {
    logger.warn("user not found:" + user);
  }
  logger.debug("users after: " + util.inspect(USERS));
  clearUserFiles(userDir,user,function(){
    fs.rmdir(path.join(USERDIR,user), function (err) {
      logger.debug('successfully deleted ' + user);
      res.write(JSON.stringify(USERS));  
      res.end();  
    });
  });
}
function userSha1(req,res,user){
  res.writeHead(200, { "Content-Type" : "text/plain" });  
  if (mp3Lists[user]){
    logger.debug("sending back sha1:" + mp3Lists[user].sha1);
    res.write("" + mp3Lists[user].sha1);
  } else {
    logger.debug("sha1, user " + user + " did not exist");
    res.write(JSON.stringify({}));  
  }
  res.end();  
}
function clearUserFiles(userDir,user,callback){
  path.exists(userDir, function(exists) {
    if(!exists) {
      logger.debug("tried to delete from a non-existing folder:" + userDir);
      callback();
    } else {
      fs.readdir(userDir, function(err,files){
          var deleteCount = files.length;
          if (deleteCount === 0) {
            callback();
          }
          jquery.map(files, function(file) {
              if (err) {throw err;}
              fs.unlink(path.join(userDir,file), function (err) {
                  if (err) {throw err;}
                  logger.debug('successfully deleted ' + file + ', ' + deleteCount + ' to go...');
                  deleteCount--;
                  if (deleteCount === 0) {
                    updateMp3List(user,function(){
                      callback();
                    });
                  }
              });
          });
      });
    }
  });
}

function createNewUser(req,res){
  var form = new formidable.IncomingForm(),
  fields = [];
  form
    .on('error', function(err) {
      res.writeHead(200, {'content-type': 'text/plain'});
      res.end('error:\n\n'+util.inspect(err));
    })
    .on('field', function(field, value) {
      p([field, value]);
      logger.debug('got new field:' + field + ',value:' + value);
      fields.push(value);
      USERS.push(value);
    })
    .on('end', function() {
      var newFolders = jquery.map(fields, function(v){ return path.join(USERDIR,v); });
      logger.debug("new users:" + fields);
      asyncUtil.asyncMap(newFolders,
          function(x,cb){fs.mkdir(x,0777,cb);}, // partial function application
          function(x){
            puts('-> post done');
            res.writeHead(200, {'content-type': 'text/plain'});
            res.end('received fields:\n\n '+util.inspect(fields));
            logger.debug('done!'+x);
          }); // done callback
    });
  form.parse(req);
}

function handleUpload(req,res,user){
  var form = new formidable.IncomingForm(),
  files = [],
  fields = [],
  currentFile;

  form.uploadDir = UPLOADDIR;
  form.keepExtensions = true;

  form.on('field', function(field, value) {
    p([field, value]);
    fields.push([field, value]);
  }).on('file', function(field, file) {
    p([field, file]);
    files.push([field, file]);
    currentFile = file;
  }).on('end', function() {
    puts('-> upload done');
    res.writeHead(200, {'content-type': 'text/plain'});
    var responseObject = [];
    jquery.map(files, function(f){
      responseObject.push({name:f[1].filename,size:f[1].length});
    });
    logger.debug("copy from to:" + currentFile.path + " to -> " +  path.join(path.join(USERDIR,user),currentFile.filename));
    fs.rename(currentFile.path,
      path.join(path.join(USERDIR,user),currentFile.filename),
      function(){
        updateMp3List(user,function(){
            res.write(JSON.stringify(responseObject));
            res.end();
        });
      }
      );
  });
  form.parse(req);
}

function rebuildMp3List(user, mp3List) {
  logger.debug("rebuildMp3List() function for:" + user);
  var trackList = jquery.map(mp3List, function(v){
    return {
      name:path.basename(v),
      modified:fs.statSync(v).mtime,
      size:fs.statSync(v).size
    };  
  });
  mp3Lists[user] = {music:trackList};
}
function updateChecksum(user,files,callback){
    cryptoHelper.calcSha1(files,function (res) {
	  // logger.debug('checksums: old:' + mp3Lists[user].sha1 + ', new:' + res);
      logger.debug('checksums: new:' + res);
      mp3Lists[user]['sha1'] = res;
      callback();
    });
}

function updateMp3List(user,callback) {
  var userDir = path.join(USERDIR,user);
  var xs = fs.readdirSync(userDir);
  logger.debug("sync result:" + xs);
  // logger.debug(util.inspect(process.memoryUsage()));
  asyncUtil.flatten(userDir, function(dirList) {
    rebuildMp3List(user, dirList);
    updateChecksum(user,dirList,callback);
  });
}



