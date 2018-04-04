/**
 * Created by hvail on 2017/9/15.
 */
const request = require('request');
const https = require('https');
const util = require('util');
let log4js = require('log4js');
const REQUIRED = "required";
let area = process.env.DATAAREA || "zh-cn";
const MqSendUrl = "http://v3.mq-rabbit.server." + area + ".sky1088.com/mq/send";
let router = {};

let logger = log4js.getLogger();
logger.level = 'info';

let getHttpOptions = function (url, data) {
    let result = {
        url: url.Url,
        method: "POST",
        json: true,
        headers: {
            "User-Agent": "Data-Push HYZ hjjhvail@gmail.com"
        },
        body: data
    };
    if (url.Headers) {
        for (let i = 0; i < url.Headers.length; i++) {
            let header = url.Headers[i].split('=');
            result.headers[header[0]] = header[1];
        }
    }
    // if (url.Data && typeof(url.Data) === 'object') {
    //     let obj = url.Data;
    //     Clone(url.Data, result.body);
    // }
    return result;
};

Array.prototype.last = function () {
    let me = this;
    return me[me.length - 1];
};

Array.prototype.first = function () {
    let me = this;
    return me[0];
};

Array.prototype.intersection = function (target) {
    let arr = [], me = this;
    for (let i = 0; i < me.length; i++) {
        if (target.indexOf(me[i]) > -1)
            arr.push(me[i]);
    }
    return arr;
};

// 跟据字段值查询数组
Array.prototype.findByField = function (field, val) {

};

// 查询字段的总和
Array.prototype.sum = function (field) {
    let arr = this;
    if (!Array.isArray(arr)) return 0;
    let sum = 0, l = arr.length;
    for (let i = 0; i < l; i++) {
        sum += (arr[i][field]) || 0;
    }
    return sum;
};

// 查询最高值
Array.prototype.max = function (field) {
    let arr = this;
    if (!Array.isArray(arr)) return 0;
    let max = -999999999;
    let l = arr.length;
    for (let i = 0; i < l; i++) {
        let _max = arr[i][field] || 0;
        max = _max > max ? _max : max;
    }
    return max;
};

// 查询最低值
Array.prototype.min = function (field) {
    let arr = this;
    if (!Array.isArray(arr)) return 0;
    let min = 999999999;
    let l = arr.length;
    for (let i = 0; i < l; i++) {
        let _min = arr[i][field] || 0;
        min = _min < min ? _min : min;
    }
    return min;
};

// 查询平均数
Array.prototype.ave = function (field) {
    let arr = this;
    if (!Array.isArray(arr)) return 0;
    let sum = 0, l = arr.length;
    for (let i = 0; i < l; i++) {
        sum += (arr[i][field]) || 0;
    }
    return sum / l;
};

Array.prototype.parseJSON = function () {
    let arr = this, result = [];
    for (let i = 0; i < arr.length; i++) {
        result.push(JSON.parse(arr[i]));
    }
    return result;
};

Array.prototype.stringifyJSON = function () {
    let arr = this, result = [];
    for (let i = 0; i < arr.length; i++) {
        result.push(JSON.stringify(arr[i]));
    }
    return result;
};

/**
 * @return {string}
 */
Date.prototype.FormatDate = function (format) {
    let dateObj = this;
    let monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let curr_date = dateObj.getDate();
    let curr_month = dateObj.getMonth() + 1;
    let curr_year = dateObj.getFullYear();
    let curr_min = dateObj.getMinutes();
    let curr_hr = dateObj.getHours();
    let curr_sc = dateObj.getSeconds();
    if (curr_month < 10) curr_month = '0' + curr_month;
    if (curr_date < 10) curr_date = '0' + curr_date;
    if (curr_hr < 10) curr_hr = '0' + curr_hr;
    if (curr_min < 10) curr_min = '0' + curr_min;
    if (format === 1)// dd-mm-yyyy
        return curr_date + "-" + curr_month + "-" + curr_year;
    else if (format === 2)// yyyy-mm-dd
        return curr_year + "-" + curr_month + "-" + curr_date;
    else if (format === 3)// dd/mm/yyyy
        return curr_date + "/" + curr_month + "/" + curr_year;
    else if (format === 4)// MM/dd/yyyy HH:mm:ss
        return curr_month + "/" + curr_date + "/" + curr_year + " " + curr_hr + ":" + curr_min + ":" + curr_sc;
    else if (format === 5)
        return curr_year + curr_month + curr_date;
    return curr_year + "-" + curr_month + "-" + curr_date + " " + curr_hr + ":" + curr_min + ":" + curr_sc;
};

/***
 * 从SRC复制到TAR
 * @param src
 * @param tar
 * @constructor
 */
router.Clone = Clone = function (src, tar) {
    let clone = {};
    if (!tar) return null;
    for (let k in src) {
        if (src.hasOwnProperty(k))
            if (!!tar[k] && typeof(src[k]) === 'number') {
                clone[k] = isNaN(tar[k]) ? 0 : tar[k];
            } else {
                clone[k] = tar[k] || src[k];
            }
    }
    return clone;
};

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
        return this._hash.hasOwnProperty(key);
    };
};

router.ClassClone = function (src, tar, res) {
    let clone = {};
    for (let k in src) {
        if (src.hasOwnProperty(k)) {
            let m = src[k];
            if (m === REQUIRED && !tar[k]) {
                res.send(204, k + "is required");
                return null;
            }
            clone[k] = tar[k] || src[k];
        }
    }
    return clone;
};

router.DoPushPost = function (url, data, cb, log) {
    request(getHttpOptions(url, data), function (err, res, body) {
        try {
            if (err) {
                // console.log(url);
                // console.log(err);
                cb && cb(url, data, 0);
                return;
            }
            // if (url.Headers)
            //     console.log(res.request.headers);
            // let msg = url + " , " + res.statusCode + " (" + JSON.stringify(body) + ") INFO : " + JSON.stringify(data);
            let msg = `Webhooks || Success || ${JSON.stringify(url)} || ${res.statusCode} || ${JSON.stringify(body)} || ${JSON.stringify(data)}`;
            logger.info(msg);
            if (res && res.statusCode > 400) {
                logger.info(url.Url + " : " + res.statusCode);
            }
        } catch (e) {
            console.log(e);
        }
        cb && cb(url, data, res.statusCode < 400 ? 1 : -1, body);
    });
};

router.logger = function (log) {
    logger.info(log);
};

router.SendMqObject = function (exchage, obj, target) {
    let tag = exchage + "." + target;
    let push = {
        Exchange: exchage,
        MsgTag: tag,
        Context: JSON.stringify(obj)
    };
    request({url: MqSendUrl, method: "POST", json: push}, function (err, res, body) {
        err && console.log(err);
    });
};

/**
 * @return {number}
 */
router.GetSecond = function () {
    return Math.round(new Date().getTime() / 1000);
};

router.PostUrl = function (url, data, cb, type) {
    request({url: url, method: "POST", json: data}, function (err, res, body) {
        let msg = `${type} || Success || ${url} || ${res.statusCode} || ${JSON.stringify(body)} || ${JSON.stringify(data)}`;
        logger.info(msg);
        // console.log(msg);
        err && console.log(err);
        cb && cb(err, res, body)
    });
};

Number.prototype.toPadLeft = function (size, chat) {
    if (arguments.length === 1) chat = '0';
    let me = this.toString();
    while (me.length < size) {
        me = chat + me;
    }
    return me;
};

router.REQUIRED = REQUIRED;
module.exports = router;
