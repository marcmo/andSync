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

syncUtil.ensureDirectory(UPLOADDIR, function() {
  syncUtil.ensureDirectory(MP3DIR, startServer);
});

function serveStaticFile(uri, res) {
  console.log("serveStaticFile, uri was:" + uri);
  var filename = path.join(process.cwd(), uri);
  path.exists(filename, function(exists) {
    if(!exists) {
      console.log(filename + " did not exist");
      res.writeHead(404, {"Content-Type": "text/plain"});  
      res.write("404 Not Found\n");  
      res.end();  
      return;  
    } 
    fs.readFile(filename, "binary", function(err, file) {  
      if(err) {  
        console.log("error...did not exist");
        res.writeHead(500, {"Content-Type": "text/plain"});  
        res.write(err + "\n");  
        res.end();  
        return;  
      }  
      console.log("ok.." + filename +"....did exist");
      res.writeHead(200);  
      res.write(file, "binary");  
      res.end();  
    });  
  });  
}

function startServer(){
  updateMp3List();
  var server = http.createServer(function(req, res) {
    console.log("server: req:" + req.url);
    var contentRegex = /\/content\/(.*\.\w*)/i;
    if (req.url == '/upload') {
      console.log("was an upload");
      var form = new formidable.IncomingForm(),
      files = [],
      fields = [],
      currentFile;

      form.uploadDir = UPLOADDIR;
      form.keepExtensions = true;

      form.on('field', function(field, value) {
        p([field, value]);
        fields.push([field, value]);
        console.log("field...expected bytes:" + form.bytesExpected + "received:" + form.bytesReceived);
      }).on('file', function(field, file) {
        p([field, file]);
        console.log(util.inspect(file));
        console.log(file.length);
        files.push([field, file]);
        currentFile = file;
        console.log("on...pushed: field:" + field + ",file:" + file);
        var x = crypto.createHash('sha1').update(file).digest('hex');
        console.log("hash:" + x);
      }).on('end', function() {
        puts('-> upload done');
        res.writeHead(200, {'content-type': 'text/plain'});
        var responseObject = [];
		jquery.map(files, function(f){
			responseObject.push({name:f[1].filename,size:f[1].length});
		});
        res.write(JSON.stringify(responseObject));
        res.end();
        console.log("end...expected " + form.bytesExpected + " bytes, received " + form.bytesReceived + " bytes.");
        fs.rename(currentFile.path,
          path.join(MP3DIR,currentFile.filename),
          updateMp3List);
      });
      form.parse(req);
    } else if(req.url === "/users") {  
		fs.readdir(USERDIR,function (err,files){
			var paths = jquery.map(files,function(v){return path.join(USERDIR,v);});
			var userDirs = [];
			jquery.map(paths, function(v,i){
				var s = fs.statSync(v);
				if (s.isDirectory()) {
					console.log("is a user:" + s);
					userDirs.push(path.basename(v));
				} 
			});
		res.writeHead(200, { "Content-Type" : "text/plain" });  
		res.write(JSON.stringify(userDirs));  
		res.end();  
		});
    } else if(req.url === "/content") {  
		res.writeHead(200, { "Content-Type" : "text/plain" });  
		res.write(JSON.stringify(myMp3List));  
		res.end();  
    } else if(req.url === "/sha1") {  
      console.log("sending back sha1:" + mp3CheckSum);
      res.writeHead(200, { "Content-Type" : "text/plain" });  
      res.write("" + mp3CheckSum);
      res.end();  
    } else if(req.url === "/clear") {  
      res.writeHead(200, { "Content-Type" : "text/plain" });  
      fs.readdir(MP3DIR, function(err,files){
          var deleteCount = files.length;
          jquery.map(files, function(file){
            if (err) {throw err;}
            fs.unlink(path.join(MP3DIR,file), function (err) {
                if (err) {throw err;}
                console.log('successfully deleted ' + file + ', ' + deleteCount + ' to go...');
                deleteCount--;
                if(deleteCount === 0){
                  updateMp3List();
                  res.write(JSON.stringify(myMp3List));  
                  res.end();
                }
            });
          });
      });
    } else if (contentRegex.test(req.url)) {
      console.log("content url was:" + req.url);
      var matchedMp3 = contentRegex.exec(req.url)[1];
      serveStaticFile(path.join("mp3Folder",unescape(matchedMp3)),res);
    } else if (req.url.match("^\/script")) {
      console.log("was a script,url:"+req.url);
      var uri = url.parse(req.url).pathname;  
      serveStaticFile(uri,res);
    } else {
      console.log("was an s.th. else: " + req.url);
      res.writeHead(404, {'content-type': 'text/plain'});
      res.end('404');
    }
  });
  server.listen(PORT);

  util.puts('listening on http://localhost:'+PORT+'/');
}

var myMp3List = [];
function rebuildMp3List(mp3List) {
  console.log("rebuildMp3List() function..." + mp3List);
  myMp3List = jquery.map(mp3List, function(v){
    return {
      name:path.basename(v),
      modified:fs.statSync(v).mtime,
      size:fs.statSync(v).size
    };  
  });
}
var mp3CheckSum = 0;
function updateChecksum(files){
    cryptoHelper.calcSha1(files,function (res) {
	  console.log('checksums: old:' + mp3CheckSum + ', new:' + res);
      mp3CheckSum = res;
    });
}

function updateMp3List() {
  console.log(util.inspect(process.memoryUsage()));
  syncUtil.flatten(MP3DIR, function(dirList) {
    rebuildMp3List(dirList);
    updateChecksum(dirList);
  });
}



