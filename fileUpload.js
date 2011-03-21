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
    syncUtil = require("syncUtil");

global.puts = futil.puts;
global.p = function() {
  futil.error(futil.inspect.apply(null, arguments));
};
global.PORT = 8080;
global.UPLOADDIR = path.join(__dirname, 'uploadDir');
global.MP3DIR = path.join(__dirname, 'mp3Folder');
global.USERDIR = path.join(__dirname, 'users');
global.USERS = [];
global.mp3Lists = {};

syncUtil.ensureDirectory(UPLOADDIR, function() {
  syncUtil.ensureDirectory(MP3DIR, function() {
    syncUtil.ensureDirectory(USERDIR, function() {
      fs.readdir(USERDIR,function (err,files){
        var paths = jquery.map(files,function(v){return path.join(USERDIR,v);});
        jquery.map(paths, function(v,i){
          var s = fs.statSync(v);
          if (s.isDirectory()) {
            USERS.push(path.basename(v));
          } 
        });
        console.log("known users: " + USERS);
        syncUtil.asyncMap(USERS.slice(), // pass in a copy
            function(u,cb){ updateMp3List(u,cb); },
            startServer);
      });
    });
  });
});

function serveStaticFile(uri, req, res) {
  var range = req.headers.range;
  var filename = path.join(process.cwd(), uri);
  path.exists(filename, function(exists) {
    if(!exists) {
      console.log(filename + " did not exist");
      res.writeHead(404, {"Content-Type": "text/plain"});  
      res.write("404 Not Found\n");  
      res.end();  
      return;  
    } 
    var fileStat = fs.statSync(filename);
    if (range){
      console.log("serving static file, was partial get with: " + range);
      var total = fileStat.size; 
      var parts = range.replace(/bytes=/, "").split("-"); 
      var partStart = parseInt(parts[0], 10); 
      var partEnd = parts[1] ? parseInt(parts[1], 10) : total-1; 
      var chunksize = partEnd-partStart; 
      console.log("start:" + partStart + ",end"+partEnd+" (total: "+total+")");
      res.writeHead(206, {
        "Content-Range": "bytes " + partStart + "-" + partEnd + "/" + total,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize
      }); 
      fs.createReadStream(filename,{'start' : partStart, 'end' : partEnd, 'flags': 'r',
																		'encoding': 'binary', 'mode': 0666, 'bufferSize': 4 * 1024})
        .addListener("data", function(chunk){
        	console.log("data chunk...");
          res.write(chunk, 'binary');
        })
        .addListener("close",function() {
        	console.log("close of read stream...");
          res.end();
        }); 
    } else {
			res.writeHead(200);  
      fs.createReadStream(filename,{'flags': 'r',
																		'encoding': 'binary', 'mode': 0666, 'bufferSize': 4 * 1024})
        .addListener("data", function(chunk){
        	console.log("data chunk...");
          res.write(chunk, 'binary');
        })
        .addListener("close",function() {
        	console.log("close of read stream...");
          res.end();
        }); 
    }
  });  
}

function deleteSingleFile(user, uri, req, res) {
		fs.unlink(uri, function (err) {
				if (err) {throw err;}
				console.log('successfully deleted ' + uri);
				updateMp3List(user,function(){
						res.write(JSON.stringify(mp3Lists[user].music));  
						res.end();
				});
		});
}

function startServer(){
  var server = http.createServer(function(req, res) {
    console.log("server: req:" + req.url);
    console.log("server: req.header" + util.inspect(req.headers));
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
  var deleteRegex = /\/user\/delete\/(.*)\/(.*\.\w*)/i;
  if (uploadRegex.test(req.url)) {
    var matchedUser = uploadRegex.exec(req.url)[1];
    console.log("was an upload for:" + matchedUser);
    handleUpload(req,res,matchedUser);
  } else if (sha1Regex.test(req.url)) {
    var matchedUser = sha1Regex.exec(req.url)[1];
    userSha1(req,res,matchedUser);
  } else if (contentRegex.test(req.url)) {
    var matchedUser = contentRegex.exec(req.url)[1];
    userContent(req,res,matchedUser);
  } else if (clearRegex.test(req.url)) {
    var matchedUser = clearRegex.exec(req.url)[1];
    clearUserFiles(req,res,matchedUser);
  } else if (getRegex.test(req.url)) {
    var matchedUser = getRegex.exec(req.url)[1];
    var matchedMp3 = getRegex.exec(req.url)[2];
    var userDir = path.join('users',unescape(matchedUser));
    console.log("trying to fetch:" + matchedMp3 + " from " + matchedUser);
    serveStaticFile(path.join(userDir,unescape(matchedMp3)),req,res);
  } else if (deleteRegex.test(req.url)) {
    var matchedUser = deleteRegex.exec(req.url)[1];
    var matchedMp3 = deleteRegex.exec(req.url)[2];
    var userDir = path.join('users',unescape(matchedUser));
    console.log("trying to delete:" + matchedMp3 + " from " + matchedUser);
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
  console.log(mp3Lists);
  console.log('trying to read user:' + user + ',mp3List=' + mp3Lists);
  res.write(JSON.stringify(mp3Lists[user].music));  
  res.end();  
}
function userSha1(req,res,user){
  console.log("sending back sha1:" + mp3Lists[user].sha1);
  res.writeHead(200, { "Content-Type" : "text/plain" });  
  res.write("" + mp3Lists[user].sha1);
  res.end();  
}
function clearUserFiles(req,res,user){
  res.writeHead(200, { "Content-Type" : "text/plain" });  
  fs.readdir(userDir, function(err,files){
      var deleteCount = files.length;
      jquery.map(files, function(file) {
          if (err) {throw err;}
          fs.unlink(path.join(userDir,file), function (err) {
              if (err) {throw err;}
              console.log('successfully deleted ' + file + ', ' + deleteCount + ' to go...');
              deleteCount--;
              if (deleteCount === 0) {
                updateMp3List(user,function(){
                    res.write(JSON.stringify(mp3Lists[user].music));  
                    res.end();
                });
              }
          });
      });
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
      console.log('got new field:' + field + ',value:' + value);
      fields.push(value);
      USERS.push(value);
    })
    .on('end', function() {
      var newFolders = jquery.map(fields, function(v){ return path.join(USERDIR,v); });
      console.log("new users:" + fields);
      syncUtil.asyncMap(newFolders,
          function(x,cb){fs.mkdir(x,0777,cb);}, // partial function application
          function(x){
            puts('-> post done');
            res.writeHead(200, {'content-type': 'text/plain'});
            res.end('received fields:\n\n '+util.inspect(fields));
            console.log('done!'+x);
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
    console.log("copy from to:" + currentFile.path + " to -> " +  path.join(path.join(USERDIR,user),currentFile.filename));
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
  console.log("rebuildMp3List() function for:" + user);
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
	  // console.log('checksums: old:' + mp3Lists[user].sha1 + ', new:' + res);
      console.log('checksums: new:' + res);
      mp3Lists[user]['sha1'] = res;
      callback();
    });
}

function updateMp3List(user,callback) {
  var userDir = path.join(USERDIR,user);
  var xs = fs.readdirSync(userDir);
  console.log("sync result:" + xs);
  // console.log(util.inspect(process.memoryUsage()));
  syncUtil.flatten(userDir, function(dirList) {
    rebuildMp3List(user, dirList);
    updateChecksum(user,dirList,callback);
  });
}



