var jade = require('jade');

var d = new Date();
var options = {
  locals:
  {
    title: 'some title...',
    mp3s: [{name: 'test.mp3', date: d }],
    upload: { name: 'testupload.mp3' }
  }
};
var jadeFile = process.argv[2];
console.log("file to process: " + jadeFile);

jade.renderFile(__dirname + '/' + jadeFile, options, function(err, html){
    if (err) throw err;
    console.log(html);
});

