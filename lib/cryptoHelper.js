var path = require('path');
require.paths.unshift(path.join(__dirname,'lib'));
var fs = require('fs'),
    crypto = require("crypto"),
    log4js = require('log4js')(),
    logger = log4js.getLogger();

logger.setLevel('WARN');

exports.calcSha1 = calcSha1;

function calcSha1(dirList,callback){
  logger.debug(dirList);
  if (dirList.length === 0) {
    logger.warn("was empty list...no sha1 calculation possible!");
    process.nextTick(function () { callback(0); });
    return;
  }
  var h = crypto.createHash('sha1');
  var op = { 'flags': 'r' , 'encoding': null , 'mode': 0666 , 'bufferSize': 32 * 1024 };
  function procFile(fileList){
    var str;
    logger.debug("called procFile, length fileList:" + fileList.length);
    if (fileList.length === 1) {
      logger.debug("last" + fileList[0]);
      str = fs.createReadStream(dirList[0],op);
      str.on('end', createEndFunction(fileList[0],afterLastFile));
    }
    else {
      var cur = fileList[0];
      fileList.splice(0,1);
      logger.debug("processing: " + cur);
      str = fs.createReadStream(cur,op);
      str.on('end', function(){procFile(fileList);});
    }
    str.on('data', function(s){
      h.update(s);
    });
    function createEndFunction(f,next){
      return function(){
        logger.debug('last data ended, was:' + f + ',type of next:' + typeof(next));
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




