var path = require('path'),
    fs = require('fs'),
    jquery = require("jquery");

exports.flatten = flatten;
exports.ensureDirectory = ensureDirectory

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

