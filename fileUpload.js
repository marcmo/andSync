var path = require('path'),
    fs = require('fs'),
	url = require("url"),
	futil = require('formidable/util'),
	http = require('http'),
    util = require('util'),
    formidable = require('formidable'),
    events = require("events"),
    jquery = require("jquery");

require.paths.unshift(path.dirname(__dirname)+'/lib');

global.puts = futil.puts;
global.p = function() {
  futil.error(futil.inspect.apply(null, arguments));
};
global.PORT = 12345;
global.UPLOADDIR = path.join(__dirname, 'uploadDir');

path.exists(UPLOADDIR, function (exists) {
	puts(exists ? UPLOADDIR + " is already there" : "creating... ");
	if (exists)
	{
		startServer();
	}
	else
	{
		fs.mkdir(UPLOADDIR,777,function(e){
			puts(UPLOADDIR + " dir created"); 
			startServer();
		});
	}
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
			fields = [];

			form.uploadDir = UPLOADDIR;
			form.keepExtensions = true;

			form.on('field', function(field, value) {
				p([field, value]);
				fields.push([field, value]);
				console.log("expected bytes:" + form.bytesExpected);
				console.log("received bytes:" + form.bytesReceived);
			}).on('file', function(field, file) {
				p([field, file]);
				console.log(util.inspect(file));
				files.push([field, file]);
				console.log("expected bytes:" + form.bytesExpected);
				console.log("received bytes:" + form.bytesReceived);
			}).on('end', function() {
				puts('-> upload done');
				res.writeHead(200, {'content-type': 'text/plain'});
				res.write('received fields:\n\n '+util.inspect(fields));
				res.write('\n\n');
				res.end('received files:\n\n '+util.inspect(files));
				console.log("expected bytes:" + form.bytesExpected);
				console.log("received bytes:" + form.bytesReceived);
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
			console.log("was a script");
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
		return {text:path.basename(v)};	
	});
	console.log("mp3s:" + mp3s + "---" + JSON.stringify(mp3s));

	mp3_list_emitter.emit("mp3s", mp3s);
}

setInterval(update_mp3_list, 5000);
function update_mp3_list() {
	console.log("updateing list...");
	var dir = path.join(process.cwd(), "mp3Folder");  
	console.log("updateing list 2...");
	flatten(dir, function(dirList) {
		get_mp3_list(dirList);
	});
}

function flatten(dir,listener) {
	var pendingDirs = 0;
	var res = [];
	function reducePendings(ps){
		if (0 === ps) { 
			pendingDirs--;
			if(0 === pendingDirs){
				listener(res);
			}
		} }
	function doFlatten(dir,n){
		pendingDirs++;
		fs.readdir(dir,function (err,files){
			var paths = jquery.map(files,function(v){return path.join(dir,v);});
			var pendingStats = paths.length;
			reducePendings(pendingStats);
			jquery.map(paths, function(v,i){
				fs.stat(v,function(err,s){
					pendingStats--;
					if (s.isDirectory()) {
						doFlatten(v,n+1);
					} else {
						res.push(v);
					}
					reducePendings(pendingStats);
				});
			});
		});
	}
	doFlatten(dir,0);
}


