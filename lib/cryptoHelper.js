var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var fs = require('fs'),
    crypto = require("crypto"),
    syncUtil = require("syncUtil");

exports.calcSha1 = calcSha1;

function calcSha1(dirList,callback){
  console.log(dirList);
  if (dirList.length === 0) {
    console.log("was empty list...no sha1 calculation possible!");
    process.nextTick(function () { callback(0); });
    return;
  }
  var h = crypto.createHash('sha1');
  var op = { 'flags': 'r' , 'encoding': null , 'mode': 0666 , 'bufferSize': 32 * 1024 };
  function procFile(fileList){
    var str;
    console.log("called procFile, length fileList:" + fileList.length);
    if (fileList.length === 1) {
      console.log("last" + fileList[0]);
      str = fs.createReadStream(dirList[0],op);
      str.on('end', createEndFunction(fileList[0],afterLastFile));
    }
    else {
      var cur = fileList[0];
      fileList.splice(0,1);
      console.log("processing: " + cur);
      str = fs.createReadStream(cur,op);
      str.on('end', function(){procFile(fileList);});
    }
    str.on('data', function(s){
      h.update(s);
    });
    function createEndFunction(f,next){
      return function(){
        console.log('last data ended, was:' + f + ',type of next:' + typeof(next));
        str = fs.createReadStream(f,op);
        str.on('end', next);
      };
    }
    function afterLastFile(){
      callback(h.digest('hex'));
    }
  }
  procFile(dirList);
}




