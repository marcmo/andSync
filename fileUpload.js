var path = require('path'),
    fs = require('fs'),
	url = require("url");
	futil = require('formidable/util');
	http = require('http'),
    util = require('util'),
    formidable = require('formidable');
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
		fs.mkdir(UPLOADDIR,0777,function(e){
			puts(UPLOADDIR + " dir created"); 
			startServer();
		});
	}
});

function startServer(){
	var server = http.createServer(function(req, res) {
	  if (req.url == '/upload') {
		console.log("was an upload");
		var form = new formidable.IncomingForm(),
			files = [],
			fields = [];

		form.uploadDir = UPLOADDIR;
		form.keepExtensions = true;

		form
		  .on('field', function(field, value) {
			p([field, value]);
			fields.push([field, value]);
			console.log("expected bytes:" + form.bytesExpected);
			console.log("received bytes:" + form.bytesReceived);
		  })
		  .on('file', function(field, file) {
			p([field, file]);
			console.log("file:::::::::::::::::::::");
			console.log(util.inspect(file));
			files.push([field, file]);
			console.log("expected bytes:" + form.bytesExpected);
			console.log("received bytes:" + form.bytesReceived);
		  })
		  .on('end', function() {
			puts('-> upload done');
			res.writeHead(200, {'content-type': 'text/plain'});
			res.write('received fields:\n\n '+util.inspect(fields));
			res.write('\n\n');
			res.end('received files:\n\n '+util.inspect(files));
			console.log("expected bytes:" + form.bytesExpected);
			console.log("received bytes:" + form.bytesReceived);
		  });
		form.parse(req);
	  } else if (req.url.match("^\/script")) {
		console.log("was a script");
		var uri = url.parse(req.url).pathname;  
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
	  } else {
		console.log("was an s.th. else: " + req.url);
		res.writeHead(404, {'content-type': 'text/plain'});
		res.end('404');
	  }
	});
	server.listen(PORT);

	util.puts('listening on http://localhost:'+PORT+'/');
}
