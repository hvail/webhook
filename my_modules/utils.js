/**
 * Created by hvail on 2017/9/15.
 */
const request = require('request');
const https = require('https');
const util = require('util');
const fs = require('fs');
const REQUIRED = "required";
var area = process.env.DATAAREA || "zh-cn";
const MqSendUrl = "http://v3.mq-rabbit.server." + area + ".sky1088.com/mq/send";
var router = {};

var __cert = "-----BEGIN CERTIFICATE-----\n" +
    "MIIC0zCCAjygAwIBAgIDAlmUMA0GCSqGSIb3DQEBCwUAMGoxKjAoBgNVBAoTIWM2\n" +
    "MDY3MjU5NTExYTc0OTc0OWQ0ZjFiZjljNmU2ZWRlMDEQMA4GA1UECxMHZGVmYXVs\n" +
    "dDEqMCgGA1UEAxMhYzYwNjcyNTk1MTFhNzQ5NzQ5ZDRmMWJmOWM2ZTZlZGUwMB4X\n" +
    "DTE3MDYwOTAzNTYwMFoXDTIwMDUyNDAzNTYwMFowOzEqMCgGA1UEChMhYzYwNjcy\n" +
    "NTk1MTFhNzQ5NzQ5ZDRmMWJmOWM2ZTZlZGUwMQ0wCwYDVQQLEwR1c2VyMIGfMA0G\n" +
    "CSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU3tVhXz5kf2c2lTL+Cy1oyLSPRNJsJ9HA\n" +
    "K79u9gU58of2F9ouNkg2jQZCvqgwdwhYNgKm5bR/B2TfTK+jKqrm0cLqWlTUb01u\n" +
    "SitVxfVHfBcrzT91tq++yXgrjHeQKf1v2jmWRGK3bxJPXMAhp1fJ1pwp9P+vb1bi\n" +
    "NLz6+PHm6QIDAQABo4G1MIGyMA4GA1UdDwEB/wQEAwIDqDAdBgNVHSUEFjAUBggr\n" +
    "BgEFBQcDAgYIKwYBBQUHAwEwDAYDVR0TAQH/BAIwADA8BggrBgEFBQcBAQQwMC4w\n" +
    "LAYIKwYBBQUHMAGGIGh0dHA6Ly9jZXJ0cy5hY3MuYWxpeXVuLmNvbS9vY3NwMDUG\n" +
    "A1UdHwQuMCwwKqAooCaGJGh0dHA6Ly9jZXJ0cy5hY3MuYWxpeXVuLmNvbS9yb290\n" +
    "LmNybDANBgkqhkiG9w0BAQsFAAOBgQCATi0Mz2yB0OM4Ll/Ju5PTpRaIBUZWJ0I6\n" +
    "X8p1oSZ06lQVqv8AtslYfdOoys9aZdOeZczfIA82A6mOFq/zO2aIXUJbZ5ECWJzi\n" +
    "kLNNMG4Zsul7iXhzXtjLsjhXAQsF//myK4z449jclRKTZOeIecNjgmM3NkYcwU/n\n" +
    "XDeacT4qyQ==\n" +
    "-----END CERTIFICATE-----";

var __key = "-----BEGIN RSA PRIVATE KEY-----\n" +
    "MIICWwIBAAKBgQDU3tVhXz5kf2c2lTL+Cy1oyLSPRNJsJ9HAK79u9gU58of2F9ou\n" +
    "Nkg2jQZCvqgwdwhYNgKm5bR/B2TfTK+jKqrm0cLqWlTUb01uSitVxfVHfBcrzT91\n" +
    "tq++yXgrjHeQKf1v2jmWRGK3bxJPXMAhp1fJ1pwp9P+vb1biNLz6+PHm6QIDAQAB\n" +
    "AoGAKFdikOV/6YPLh6iW1VZA8M64iT49somJUqX3zYuKSgUQhy7WBlP7M3teaF/B\n" +
    "eA3W4wC5V+/IWRqJn1flIUMAyA0GYVQTBwn4s5ZE9br9DeGTSYkfvujYgJUapIGN\n" +
    "NSbVUcjxn84c4s8m9CGkCUcqFr+YEUJS0fZ9WGi1hPcuNkECQQDyJNO+XFF6jAea\n" +
    "0yUmObX/pyXWyxOOp+pYg5kFfHTsfNM1KW5UWee2cMpXkfggL0QBdfWhu/seasrY\n" +
    "kWvYwsxtAkEA4Q0t5DAEYNmGsiLtwoz3qr/EvPZR/AQCAG4mRPzINvAmnZKSoV13\n" +
    "VibvSHRD2GHd7zojnx1cPCjgvMJSQ9F+7QJARrqZGwaOSjRy2DeKp2K+FaH2PIpu\n" +
    "+QF1Q0uVO/QBlz5S1zl136+vLiw9/lxF1OjZfW++QvLMxDK/c4juro8f9QJATmaX\n" +
    "+SmdLNw6523xpFgVo79g2294SjJfPCUjYd8qJLFu0nAQcvSrsTCpJXWTeRtHBKMd\n" +
    "a73/ttmKyVds70FZVQJAKLvLe8zh1XyyoJr+KwjqKgc5X7OzBuLxrBIvkSgIz3ew\n" +
    "aIzvgP2/fH4FewsVbRwm0J0u3zNWJI9vY1vaGvSstQ==\n" +
    "-----END RSA PRIVATE KEY-----";

var getHttpsOption = function (url, key, cert) {
    var options = {
        hostname: "master1g3.cs-cn-shenzhen.aliyun.com",
        port: 13880,
        path: '/services/web-interface_resources-master/stop',
        method: 'POST',
        rejectUnauthorized: false,
        key: fs.readFileSync('E:\\Project\\JavaJars\\cert\\cert-files-hyz\\key.pem'),
        cert: fs.readFileSync('E:\\Project\\JavaJars\\cert\\cert-files-hyz\\cert.pem'),
        ca: fs.readFileSync('E:\\Project\\JavaJars\\cert\\cert-files-hyz\\ca.pem'),
        // agent: false
    };
    return options;
}

// var __opt = getHttpsOption("https://master1g3.cs-cn-shenzhen.aliyun.com:13880/services/web-interface_resources-master/stop", __key, __cert);
// console.log(__opt.key.toString());
// console.log(__opt.cert.toString());
// console.log(__opt.ca.toString());
// __opt.agent = new https.Agent(__opt);
//
// https.request(__opt,
//     function (res, a, b) {
//         console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
//         console.log(a);
//         console.log(b);
//         console.log(res);
//     });

var getHttpOptions = function (url, data) {
    var http_options = {
        url: url,
        method: "POST",
        json: true,
        headers: {
            'User-Agent': 'Data-Push HYZ hjjhvail@gmail.com'
        },
        body: data
    };
    return http_options;
}

Array.prototype.last = function () {
    var me = this;
    return me[me.length - 1];
}

Array.prototype.first = function () {
    var me = this;
    return me[0];
}

// 跟据字段值查询数组
Array.prototype.findByField = function (field, val) {

}

// 查询字段的总和
Array.prototype.sum = function (field) {
    var arr = this;
    if (!Array.isArray(arr)) return 0;
    var sum = 0, l = arr.length;
    for (var i = 0; i < l; i++) {
        sum += (arr[i][field]) || 0;
    }
    return sum;
}

// 查询最高值
Array.prototype.max = function (field) {
    var arr = this;
    if (!Array.isArray(arr)) return 0;
    var max = -999999999;
    var l = arr.length;
    for (var i = 0; i < l; i++) {
        var _max = arr[i][field] || 0;
        max = _max > max ? _max : max;
    }
    return max;
}

// 查询最低值
Array.prototype.min = function (field) {
    var arr = this;
    if (!Array.isArray(arr)) return 0;
    var min = 999999999;
    var l = arr.length;
    for (var i = 0; i < l; i++) {
        var _min = arr[i][field] || 0;
        min = _min < min ? _min : min;
    }
    return min;
}

// 查询平均数
Array.prototype.ave = function (field) {
    var arr = this;
    if (!Array.isArray(arr)) return 0;
    var sum = 0, l = arr.length;
    for (var i = 0; i < l; i++) {
        sum += (arr[i][field]) || 0;
    }
    return sum / l;
}

Date.prototype.FormatDate = function (format) {
    var dateObj = this;
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var curr_date = dateObj.getDate();
    var curr_month = dateObj.getMonth();
    curr_month = curr_month + 1;
    var curr_year = dateObj.getFullYear();
    var curr_min = dateObj.getMinutes();
    var curr_hr = dateObj.getHours();
    var curr_sc = dateObj.getSeconds();
    if (curr_month.toString().length == 1) curr_month = '0' + curr_month;
    if (curr_date.toString().length == 1) curr_date = '0' + curr_date;
    if (curr_hr.toString().length == 1) curr_hr = '0' + curr_hr;
    if (curr_min.toString().length == 1) curr_min = '0' + curr_min;

    if (format == 1)//dd-mm-yyyy
    {
        return curr_date + "-" + curr_month + "-" + curr_year;
    }
    else if (format == 2)//yyyy-mm-dd
    {
        return curr_year + "-" + curr_month + "-" + curr_date;
    }
    else if (format == 3)//dd/mm/yyyy
    {
        return curr_date + "/" + curr_month + "/" + curr_year;
    }
    else if (format == 4)// MM/dd/yyyy HH:mm:ss
    {
        return curr_month + "/" + curr_date + "/" + curr_year + " " + curr_hr + ":" + curr_min + ":" + curr_sc;
    }
}

/***
 * 从SRC复制到TAR
 * @param src
 * @param tar
 * @constructor
 */
router.Clone = function (src, tar) {
    var clone = {};
    if (!tar) return null;
    for (var k in src) {
        if (!!tar[k] && typeof(src[k]) == 'number') {
            clone[k] = isNaN(tar[k]) ? 0 : tar[k];
        } else {
            clone[k] = tar[k] || src[k];
        }
    }
    return clone;
}

router.Hash = function Hashtable() {
    this._hash = {};
    this._count = 0;
    this.add = function (key, value) {
        if (this._hash.hasOwnProperty(key)) return false;
        else {
            this._hash[key] = value;
            this._count++;
            return true;
        }
    }
    this.remove = function (key) {
        delete this._hash[key];
        this._count--;
    }
    this.count = function () {
        return this._count;
    }
    this.items = function (key) {
        if (this.contains(key)) return this._hash[key];
    }
    this.contains = function (key) {
        return this._hash.hasOwnProperty(key);
    }
    this.clear = function () {
        this._hash = {};
        this._count = 0;
    }
    this.indexof = function (key) {
        return this._hash.hasOwnProperty(key) ? true : false;
    }
};

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
        if (url.indexOf("sky1088") < 0) {
            console.log(url + " : " + res.statusCode + " ( " + JSON.stringify(body) + " ) INFO : " + JSON.stringify(data));
        }
        cb && cb(url, data, res.statusCode < 400 ? 1 : -1, body);
    })
}

router.SendMqObject = function (exchage, obj, target) {
    var tag = exchage + "." + target;
    var push = {
        Exchange: exchage,
        MsgTag: tag,
        Context: JSON.stringify(obj)
    };
    request(getHttpOptions(MqSendUrl, push));
}

router.GetSecond = function () {
    return Math.round(new Date().getTime() / 1000);
}

router.REQUIRED = REQUIRED;
module.exports = router;