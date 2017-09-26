/**
 * Created by hvail on 2017/9/15.
 */
const request = require('request');
const REQUIRED = "required";
var router = {};

var getHttpOptions = function (url, data) {
    var http_options = {
        url: url,
        method: "POST",
        json: true,
        headers: {
            'User-Agent': 'Data-Push HYZ hjjhvail@gmail.com'
            // 'Content-Type': 'application/json'
        },
        body: data
    };
    return http_options;
}

/***
 * 从SRC复制到TAR ,
 * @param src
 * @param tar
 * @constructor
 */
router.Clone = function (src, tar) {
    var clone = {};
    if (!tar) {
        return null;
    }
    for (var k in src) {
        if (!!tar[k] && typeof(src[k]) == 'number') {
            clone[k] = isNaN(tar[k]) ? 0 : tar[k];
        } else {
            clone[k] = tar[k] || src[k];
        }
    }
    return clone;
}

router.ClassClone = function (src, tar, res) {
    var clone = {};
    for (var k in src) {
        var m = src[k];
        if (m == REQUIRED && !tar[k]) {
            res.send(204, k + "is required");
            return null;
        }
        clone[k] = tar[k] || src[k];
    }
    return clone;
}

router.DoPushPost = function (url, data, cb) {
    request(getHttpOptions(url, data), function (err, res, body) {
        cb && cb(url, data, res.statusCode < 400 ? 1 : -1);
    })
}

router.REQUIRED = REQUIRED;
module.exports = router;