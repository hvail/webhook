/**
 * Created by hvail on 2018/4/24.
 */
const redis = require('./../my_modules/redishelp');
const request = require('request');
const util = require('./../my_modules/utils');

// 先读取这一个的所有连接
let now = (new Date().getTime() - 900000) / 1000;
let date = new Date(new Date().getTime() - 86400000);
let year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
let batchQueryUrl = "http://v3.res.server.zh-cn.sky1088.com/track/batch/";
let cleanUrl = "http://webhook.zh-cn.sky1088.com/mileage/single/";
if (month < 10) month = '0' + month;
if (day < 10) day = '0' + day;
let key = `total_set_sorted_net_conn_day_${year}${month}${day}`;
let removeList = [];

const doPoolUrl = (arr, i, cb) => {
    console.log(`${i} : ${arr[i]}`);
    request(arr[i++], (err, res, body) => {
        let data = JSON.parse(body);
        for (let j = 0; j < data.length; j++) {
            if (data[j].GPSTime < now) {
                removeList.push(data[j].SerialNumber);
            }
        }
        if (i >= arr.length) {
            cb && cb();
        } else {
            doPoolUrl(arr, i, cb);
        }
    });
};

const doClean = (i) => {
    let _i = i || 0;
    let url = cleanUrl + removeList[_i++];
    request(url, (err, res, body) => {
        console.log(`${url} : ${body}`);
        doClean(_i);
    });
    if (_i >= removeList.length) process.exit();
};

redis.ZRANGE(key, 0, -1, (err, data) => {
    let m = 0, n = 100;
    let urlArr = [];
    while (m + n < data.length) {
        let arr = data.slice(m, m + n);
        let url = batchQueryUrl + arr.join(',');
        urlArr.push(url);
        m += n;
    }
    // doPoolUrl(urlArr, 0, );
    doPoolUrl(urlArr, 0, doClean);
});
