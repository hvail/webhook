/***
 * 日报表(以0时区为准)
 * Created by hvail on 2018/4/24.
 */
/****
 * 1 读取有联网的设备
 * 2 对联网设备进行处理分类
 * 3 读取单台设备的当天联网记录
 * 4 分析联网记录，计算各类数据的统计
 * 5 记录统计，存放于ots
 * 6 分析当天的GPS数据。
 * 7 对比GPS过滤后和过滤前的数据
 * 8 分析电量数据
 * 9 分析报警数据
 */
const redis = require('./../my_modules/redishelp');
const request = require('request');
const area = process.env.DATAAREA || "zh-cn";

let date = new Date(new Date().getTime() - 86400000);
let dateTick = date.getTime() / 1000;
let start = dateTick - (dateTick % 86400), end = start + 86400;
let year = date.getFullYear(), month = date.getMonth() + 1, day = date.getDate();
if (month < 10) month = '0' + month;
if (day < 10) day = '0' + day;
let key = `total_set_sorted_net_conn_day_${year}${month}${day}`;
console.log(key);

redis.ZRANGE(key, 0, -1, 'WITHSCORES', (err, data) => {
    let m = 0, n = 2;
    let urlArr = [];
    if (err) console.log(err);
    console.log(`${key} Length Is ${data.length}`)
    while (m + n < data.length) {
        let cc = data[m + 1] * 1;
        // 如果条数小于2，则无必要读取相关数据
        let url = `http://v3.res.server.${area}.sky1088.com/netinfo/range/${data[m]}/${start}/${end}`;
        m += n;
        if (cc <= 3) continue;
        urlArr.push(url);
        console.log(`${cc} : ${url}`);
    }
    console.log(urlArr.length);
});