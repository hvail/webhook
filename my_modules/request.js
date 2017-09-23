const URL = require('url');
const http = require('http');
var _index = 0;
var requestGetUrl = function (url, cb, eb) {
    var option = URL.parse(url);
    option.method = "GET";
    var req = http.request(option, function (httpRes) {
        var buffers = [];
        httpRes.on('data', function (chunk) {
            buffers.push(chunk);
        });

        httpRes.on('end', function (chunk) {
            var wholeData = Buffer.concat(buffers);
            var dataStr = wholeData.toString('utf8');
            cb && cb(dataStr);
        });
    }).on('error', function (err) {
        eb && eb(err);
    });
    req.end();
}

var requestPostUrl = function (url, data, cb, eb) {
    var option = URL.parse(url);
    option.method = "POST";
    option.headers = {
        'Content-Type': 'application/json',
    }
    var _id = data._id;
    var req = http.request(option, function (httpRes) {
        _index++;
        // if (_index % 100 == 0)
        //     console.log(_index + " - " + _id + ' - STATUS: ' + httpRes.statusCode + ":" + option.path);
        if (httpRes.statusCode == 204) {
            cb && cb();
            return;
        }
        var buffers = [];
        httpRes.on('data', function (chunk) {
            buffers.push(chunk);
        });

        httpRes.on('end', function (chunk) {
            var wholeData = Buffer.concat(buffers);
            var dataStr = wholeData.toString('utf8');
            cb && cb(dataStr);
        });
    }).on('error', function (err) {
        console.log(err);
        console.log("requestPostUrl err");
        eb && eb(err);
    });
    delete data._id;
    req.write(JSON.stringify(data));
    req.end();
}

module.exports = {
    Get: requestGetUrl,
    Post: requestPostUrl
}