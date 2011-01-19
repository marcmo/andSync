var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var fs = require('fs'),
    crypto = require("crypto"),
    jquery = require("jquery"),
    events = require("events"),
    syncUtil = require("syncUtil");

global.MP3DIR = path.join(__dirname, 'mp3Folder');

console.log("hi");
var xs = ["abc","cde","efg"];

// 
// h.update("hasdfsa");
// console.log("initial hash:" + h.digest('hex'));
// jquery.map(xs, function(value) { 
//   console.log(value); 
//   h.update(value);
// });
  // h.update(v).digest('hex');
// console.log("final hash:" + h);
//

syncUtil.flatten(MP3DIR, function(dirList) {
  console.log(dirList);
  var mp3Pos = 0;
  function addUp(acc,x){ return path.basename(x).length + acc; }
  var res = dirList.reduce(addUp, 0);
  console.log('res was:' + res);

  var h = crypto.createHash('sha1');
  // var str = fs.createReadStream(path.join(MP3DIR, 'logo.png'));
  var str = fs.createReadStream(dirList[0]);
  str.on('data', function(s){
    console.log('data arrived');
    h.update(s);
  });
  str.on('end', createEndFunction(path.join(MP3DIR, 'Christine.mp3'), afterLastFile));

  function createEndFunction(f,next){
    return function(){
      console.log('data ended');
      str = fs.createReadStream(f);
      str.on('end', next);
    };
  }

  function afterLastFile(){
    console.log("last hash:" + h.digest('hex'));
  }
});




