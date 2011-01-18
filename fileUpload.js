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
	syncUtil = require("syncUtil");

global.puts = futil.puts;
global.p = function() {
  futil.error(futil.inspect.apply(null, arguments));
};
global.PORT = 12345;
global.UPLOADDIR = path.join(__dirname, 'uploadDir');
global.MP3DIR = path.join(__dirname, 'mp3Folder');

syncUtil.ensureDirectory(UPLOADDIR, function() {
	syncUtil.ensureDirectory(MP3DIR, startServer);
});

function serve_static_file(uri, res) {
	console.log("serve_static_file");
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
	var server = http.createServer(function(req, res) {
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
				console.log("on...expected bytes:" + form.bytesExpected);
				console.log("on...received bytes:" + form.bytesReceived);
			}).on('end', function() {
				puts('-> upload done');
				res.writeHead(200, {'content-type': 'text/plain'});
				res.write('received fields:\n\n '+util.inspect(fields));
				res.write('\n\n');
				res.end('received files:\n\n '+util.inspect(files));
				console.log("end...expected bytes:" + form.bytesExpected);
				console.log("end...received bytes:" + form.bytesReceived);
				console.log("currentFile: " + currentFile.filename);
				console.log("currentFile: " + currentFile.path);
				fs.rename(currentFile.path,path.join(MP3DIR,currentFile.filename));
			});
			form.parse(req);
		} else if(req.url === "/stream") {  
			var listenerFunction = function(mp3s) {  
				res.writeHead(200, { "Content-Type" : "text/plain" });  
				res.write(JSON.stringify(mp3s));  
				res.end();  
				clearTimeout(timeout);  
			};
			mp3_list_emitter.addListener("mp3s", listenerFunction);

			var timeout = setTimeout(function() {  
				res.writeHead(200, { "Content-Type" : "text/plain" });  
				res.write(JSON.stringify([]));  
				res.end();  

				mp3_list_emitter.removeListener("mp3s",listenerFunction);  
			}, 1000);  

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

var mp3_list_emitter = new events.EventEmitter();
function get_mp3_list(mp3List) {
	console.log("get_mp3_list() function..." + mp3List);
	var mp3s = jquery.map(mp3List, function(v){
		return {
			name:path.basename(v),
			modified:fs.statSync(v).mtime,
			size:fs.statSync(v).size
		};	
	});
	console.log("mp3s:" + mp3s + "---" + JSON.stringify(mp3s));

	mp3_list_emitter.emit("mp3s", mp3s);
}

function update_mp3_list() {
	console.log(util.inspect(process.memoryUsage()));
	syncUtil.flatten(MP3DIR, function(dirList) {
		get_mp3_list(dirList);
	});
}

setInterval(update_mp3_list, 5000);


