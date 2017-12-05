/**
 * Created by hvail on 2017/9/15.
 */
const request = require('request');
const https = require('https');
const util = require('util');
var log4js = require('log4js');
const fs = require('fs');
const REQUIRED = "required";
var area = process.env.DATAAREA || "zh-cn";
const MqSendUrl = "http://v3.mq-rabbit.server." + area + ".sky1088.com/mq/send";
var router = {};

log4js.configure({
    appenders: {
        everything: {type: 'dateFile', filename: 'all-the-logs.log', pattern: '.yyyy-MM-dd-hh', compress: true}
    },
    categories: {
        default: {appenders: ['everything'], level: 'info'}
    }
});
var logger = log4js.getLogger();

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
};

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
};

// 查询平均数
Array.prototype.ave = function (field) {
    var arr = this;
    if (!Array.isArray(arr)) return 0;
    var sum = 0, l = arr.length;
    for (var i = 0; i < l; i++) {
        sum += (arr[i][field]) || 0;
    }
    return sum / l;
};

Date.prototype.FormatDate = function (format) {
    var dateObj = this;
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var curr_date = dateObj.getDate();
    var curr_month = dateObj.getMonth() + 1;
    var curr_year = dateObj.getFullYear();
    var curr_min = dateObj.getMinutes();
    var curr_hr = dateObj.getHours();
    var curr_sc = dateObj.getSeconds();
    if (curr_month < 10) curr_month = '0' + curr_month;
    if (curr_date < 10) curr_date = '0' + curr_date;
    if (curr_hr < 10) curr_hr = '0' + curr_hr;
    if (curr_min < 10) curr_min = '0' + curr_min;
    if (format == 1)// dd-mm-yyyy
        return curr_date + "-" + curr_month + "-" + curr_year;
    else if (format == 2)// yyyy-mm-dd
        return curr_year + "-" + curr_month + "-" + curr_date;
    else if (format == 3)// dd/mm/yyyy
        return curr_date + "/" + curr_month + "/" + curr_year;
    else if (format == 4)// MM/dd/yyyy HH:mm:ss
        return curr_month + "/" + curr_date + "/" + curr_year + " " + curr_hr + ":" + curr_min + ":" + curr_sc;
    else if (format == 5)
        return curr_year + curr_month + curr_date;
    return curr_year + "-" + curr_month + "-" + curr_date + " " + curr_hr + ":" + curr_min + ":" + curr_sc;
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
    };
    this.remove = function (key) {
        delete this._hash[key];
        this._count--;
    };
    this.count = function () {
        return this._count;
    };
    this.items = function (key) {
        if (this.contains(key)) return this._hash[key];
    };
    this.contains = function (key) {
        return this._hash.hasOwnProperty(key);
    };
    this.clear = function () {
        this._hash = {};
        this._count = 0;
    };
    this.indexof = function (key) {
        return this._hash.hasOwnProperty(key) ? true : false;
    };
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
};

router.DoPushPost = function (url, data, cb, log) {
    request(getHttpOptions(url, data), function (err, res, body) {
        if (url.indexOf("sky1088") < 0 || log) {
            var path = new Date().FormatDate(5) + ".csv";
            logger.info(url + " : " + res.statusCode + " ( " + JSON.stringify(body) + " ) INFO : " + JSON.stringify(data));
            console.log(url + " : " + res.statusCode + " ( " + JSON.stringify(body) + " ) INFO : " + JSON.stringify(data));
        }
        cb && cb(url, data, res.statusCode < 400 ? 1 : -1, body);
    });
};

router.SendMqObject = function (exchage, obj, target) {
    var tag = exchage + "." + target;
    var push = {
        Exchange: exchage,
        MsgTag: tag,
        Context: JSON.stringify(obj)
    };
    request(getHttpOptions(MqSendUrl, push));
};

router.GetSecond = function () {
    return Math.round(new Date().getTime() / 1000);
};

router.REQUIRED = REQUIRED;
module.exports = router;