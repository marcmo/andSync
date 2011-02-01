var path = require('path'),
    fs = require('fs'),
    jquery = require("jquery");

exports.flatten = flatten;
exports.ensureDirectory = ensureDirectory;
exports.asyncMap = asyncMap;

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
	  console.log('flatten dir:' + dir);
		pendingDirs++;
		fs.readdir(dir,function (err,files){
      if (err) {throw err;}
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

function ensureDirectory(dir,callback) {
	path.exists(dir, function (exists) {
		console.log(exists ? dir + " is already there" : "creating... ");
		if (exists)
		{
			callback();
		}
		else
		{
			fs.mkdir(dir,0777,function(e){
				console.log(dir + " dir created"); 
				callback();
			});
		}
	});
}

function asyncMap(elems,asyncF,callback){
  var res = [];
  recurse(elems);
  function recurse(xs){
    if (xs.length === 0) {
      callback(res);
    }
    else {
      var cur = xs[0];
      xs.splice(0,1);
      asyncF(cur,function(result) {res.push(result);recurse(xs);});
    }
  }
}

// example usage:
function asyncDoubleIt(x,callback){
  process.nextTick(function () {
    callback(2*x);
  });
}
function mapOverListWithAsyncFunction(){
  asyncMap(
      [1,2,3,4], 
      asyncDoubleIt, 
      function(x){ console.log('here again, x=' + x);});
}
function createSampleDirs(){
  asyncMap(
      ["one","two"], // list to iterate over
      function(x,cb){fs.mkdir(x,0777,cb);}, // partial function application
      function(x){console.log('done!'+x);}); // done callback
}


