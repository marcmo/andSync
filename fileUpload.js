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
    syncUtil = require("syncUtil");

global.puts = futil.puts;
global.p = function() {
  futil.error(futil.inspect.apply(null, arguments));
};
global.PORT = 8080;
global.UPLOADDIR = path.join(__dirname, 'uploadDir');
global.MP3DIR = path.join(__dirname, 'mp3Folder');

syncUtil.ensureDirectory(UPLOADDIR, function() {
  syncUtil.ensureDirectory(MP3DIR, startServer);
});

function serve_static_file(uri, res) {
  console.log("serve_static_file, uri was:" + uri);
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
        console.log("field...expected bytes:" + form.bytesExpected);
        console.log("field...received bytes:" + form.bytesReceived);
      }).on('file', function(field, file) {
        p([field, file]);
        console.log(util.inspect(file));
        files.push([field, file]);
        currentFile = file;
        console.log("currentFile: " + currentFile);
        console.log("on...pushed: field:" + field + ",file:" + file);
        var x = crypto.createHash('sha1').update(file).digest('hex');
        console.log("hash:" + x);
      }).on('end', function() {
        puts('-> upload done');
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received fields:\n\n '+util.inspect(fields));
        res.write('\n\n');
        res.end('received files:\n\n '+util.inspect(files));
        console.log("end...expected " + form.bytesExpected + " bytes, received " + form.bytesReceived + " bytes.");
        console.log("currentFile: " + currentFile.filename);
        fs.rename(currentFile.path,
          path.join(MP3DIR,currentFile.filename),
          updateMp3List);
      });
      form.parse(req);
    } else if(req.url === "/content") {  
      res.writeHead(200, { "Content-Type" : "text/plain" });  
      res.write(JSON.stringify(myMp3List));  
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
      serve_static_file(path.join("mp3Folder",unescape(matchedMp3)),res);
    } else if (req.url.match("^\/script")) {
      console.log("was a script,url:"+req.url);
      var uri = url.parse(req.url).pathname;  
      serve_static_file(uri,res);
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
function get_mp3_list(mp3List) {
  console.log("get_mp3_list() function..." + mp3List);
  myMp3List = jquery.map(mp3List, function(v){
    return {
      name:path.basename(v),
      modified:fs.statSync(v).mtime,
      size:fs.statSync(v).size
    };  
  });
}

function updateMp3List() {
  console.log(util.inspect(process.memoryUsage()));
  syncUtil.flatten(MP3DIR, function(dirList) {
    get_mp3_list(dirList);
  });
}



