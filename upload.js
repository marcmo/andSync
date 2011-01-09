var path = require('path'),
    fs = require('fs');

require.paths.unshift(path.dirname(__dirname)+'/lib');
var util = require('formidable/util');

try {
  global.Gently = require('gently');
} catch (e) {
  throw new Error('this test suite requires node-gently');
}

global.GENTLY = new Gently();

global.puts = util.puts;
global.p = function() {
  util.error(util.inspect.apply(null, arguments));
};
global.assert = require('assert');
global.TEST_PORT = 13532;
global.TEST_TMP = path.join(__dirname, 'uploadDir');
var http = require('http'),
    util = require('util'),
    formidable = require('formidable');

path.exists(TEST_TMP, function (exists) {
	puts(exists ? TEST_TMP + " is already there" : "creating... ");
	if (exists)
	{
		startServer();
	}
	else
	{
		fs.mkdir(TEST_TMP,0777,function(e){
			puts(TEST_TMP + " dir created"); 
			startServer();
		});
	}
});

function startServer(){
	var server = http.createServer(function(req, res) {
	  if (req.url == '/') {
		res.writeHead(200, {'content-type': 'text/html'});
		res.end(
		  '<form action="/upload" enctype="multipart/form-data" method="post">'+
		  '<input type="text" name="title"><br>'+
		  '<input type="file" name="upload" multiple="multiple"><br>'+
		  '<input type="submit" value="Upload">'+
		  '</form>'
		);
	  } else if (req.url == '/upload') {
		var form = new formidable.IncomingForm(),
			files = [],
			fields = [];

		form.uploadDir = TEST_TMP;
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
	  } else {
		res.writeHead(404, {'content-type': 'text/plain'});
		res.end('404');
	  }
	});
	server.listen(TEST_PORT);

	util.puts('listening on http://localhost:'+TEST_PORT+'/');
}
