/**
 * Created by hvail on 2017/9/15.
 */
const request = require('request');
const REQUIRED = "required";
var area = process.env.DATAAREA || "zh-cn";
const MqSendUrl = "http://v3.mq-rabbit.server." + area + ".sky1088.com/mq/send";
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

Array.prototype.last = function () {
    var me = this;
    return me[me.length - 1];
}

Array.prototype.first = function () {
    var me = this;
    return me[0];
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