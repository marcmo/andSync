
/**
 * Module dependencies.
 */

var connect = require('connect'),
    form = require('connect-form'),
    assert = require('assert');

// Test server

var server = connect.createServer(
    form(),
    function(req, res, next){
        if (req.form) {
            req.form.complete(function(err, fields, files){
                console.log("form complete");
                console.log("fields: " + (JSON.stringify(fields)));
                console.log("files: " + (JSON.stringify(files)));
                res.writeHead(200, {});
                if (err) res.write(JSON.stringify(err.message));
                res.write(JSON.stringify(fields));
                res.write(JSON.stringify(files));
                res.end();
            });
        } else {
            next();
        }
    }
);

// Tests

exports['test single multipart field'] = function(){
    var headers = {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryMfJEpQcCbybb6A8U'
    };

    var body = [
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data; name="name"',
        '',
        'foo',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U--\r\n'
    ].join('\r\n');

    assert.response(server,
        { url: '/' },
        { body: 'Cannot GET /' });
    
    assert.response(server,
        { url: '/', method: 'POST', headers: headers, data: body },
        { body: '{"name":"foo"}{}' });
};

exports['test several multipart fields'] = function(){
    var headers = {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryMfJEpQcCbybb6A8U'
    };

    var body = [
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data; name="name"',
        '',
        'foo',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data: name="comments"',
        '',
        'foo bar baz',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U--\r\n'
    ].join('\r\n');

    assert.response(server,
        { url: '/', method: 'POST', headers: headers, data: body },
        { body: '{"name":"foo","comments":"foo bar baz"}{}' });
};

exports['test malformed multipart'] = function(){
    var headers = {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryMfJEpQcCbybb6A8U'
    };

    var body = [
        '--WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data; name="name"',
        '',
        'foo',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U--\r\n'
    ].join('\r\n');

    assert.response(server,
        { url: '/', method: 'POST', headers: headers, data: body },
        { body: '"parser error, 2 of 134 bytes parsed"{}{}' });
};

exports['test multipart files'] = function(){
    var headers = {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundaryMfJEpQcCbybb6A8U'
    };

    var body = [
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data; name="name"',
        '',
        'foo',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U',
        'Content-Disposition: form-data: name="text"; filename="foo.txt"',
        '',
        'foo\nbar\nbaz\n',
        '------WebKitFormBoundaryMfJEpQcCbybb6A8U--\r\n'
    ].join('\r\n');

    assert.response(server,
        { url: '/', method: 'POST', headers: headers, data: body },
        function(res){
            assert.ok(res.body.indexOf('{"name":"foo"}') >= 0, 'Test field');
            assert.ok(res.body.indexOf('{"path":"/tmp') >= 0, 'Test file path');
        });
};

exports['test urlencoded'] = function(){
    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };
    
    var body = 'thanks=felix&for=the&cool=lib';
    
    assert.response(server,
        { url: '/', method: 'POST', data: body, headers: headers },
        { body: '{"thanks":"felix","for":"the","cool":"lib"}{}' });
};

exports['test bodyParser'] = function(){
    var server = connect.createServer(
        connect.bodyParser(),
        form(),
        function(req, res){
            res.writeHead(200, {});
            res.end(JSON.stringify(req.body));
        }
    );

    var headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    var body = 'foo=bar';
    
    assert.response(server,
        { url: '/', method: 'POST', data: body, headers: headers },
        { body: '{"foo":"bar"}' });
};

