const URL = require('url');
const http = require('http');
let _index = 0;
let requestGetUrl = function (url, cb) {
    let option = URL.parse(url);
    option.method = "GET";
    let req = http.request(option, function (httpRes) {
        let buffers = [];
        httpRes.on('data', function (chunk, x, y) {
            buffers.push(chunk);
        });

        httpRes.on('end', function (chunk) {
            let wholeData = Buffer.concat(buffers);
            let dataStr = wholeData.toString('utf8');
            cb && cb(null, dataStr);
        });
    }).on('error', cb);
    req.end();
}

let requestPostUrl = function (url, data, cb) {
    let option = URL.parse(url);
    option.method = "POST";
    option.headers = {
        'Content-Type': 'application/json',
    }
    let req = http.request(option, function (httpRes) {
        _index++;
        if (httpRes.statusCode === 204) {
            cb && cb(null);
            return;
        }
        let buffers = [];
        httpRes.on('data', function (chunk) {
            buffers.push(chunk);
        });

        httpRes.on('end', function (chunk) {
            let wholeData = Buffer.concat(buffers);
            let dataStr = wholeData.toString('utf8');
            cb && cb(null, dataStr);
        });
    }).on('error', function (err) {
        console.log(err);
        console.log("requestPostUrl err");
        cb && cb(err);
    });
    req.write(JSON.stringify(data));
    req.end();
}

module.exports = {
    Get: requestGetUrl,
    Post: requestPostUrl
}