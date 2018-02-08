/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const request = require('request');
const express = require('express');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const calc_mid = 5 * 60;              // 计算间隔5分钟
const calc_length = 2 * calc_mid;    // 单次读取长度,2个计算周期 10分钟计算一次以减少系统压力和提高响应速度
const post_url = `http://v3.res.server.${area}.sky1088.com/mileage`;
// 存储规则为右进左出
// RPUSH & LRANGE
let redisMileageList = "list-run-mileage-";
let redisMileageListPatten = /list-run-mileage-(.*)/;
let redisMileageSortedSet = "SSET-speak-mileage-last";

let demo = function (req, res, next) {
    res.send('mileage v2.0.0');
};

let _format_gt = function (time, mid) {
    return time - (time % mid);
};

let _calc_pack_mileage = function (pack_hash) {
    let top_end_point = null;
    let top_key;
    let sn;
    let obj = new myUtil.Hash();
    for (let key in pack_hash._hash) {
        if (!pack_hash._hash.hasOwnProperty(key)) continue;
        let ps = pack_hash._hash[key];
        if (ps.length < 2) continue;
        let pf = ps.first(), pe = ps.last();
        let sn = pf.SerialNumber;
        let _maxSpeed = ps.max('Speed');
        let _aveMileage = ps.ave('Mileage');
        if (!top_end_point) top_end_point = pf;
        let dis = Math.round((pe.Mileage - top_end_point.Mileage) * 1000);
        if (dis < 0 || dis > 20000 || pe.Mileage < 10 || pe.Mileage % 1 !== 0) {
            // 如果量程小于0，距离大于20公里，总里程小于10，总里程不是整数，则取全部的距离
            let middle_time = pf.GPSTime - top_end_point.GPSTime;
            // 如果有上一个点并且和此次时间相差小于静止间隔，则按比例分配两点间的距离
            let mid_distance = gpsUtil.GetDistance(top_end_point.Lat, top_end_point.Lng, pf.Lat, pf.Lng) || 0;
            if (middle_time > 0 && middle_time < calc_mid && mid_distance > 10) {
                let ut = mid_distance / middle_time;
                let ft = _format_gt(pf.GPSTime, calc_mid);
                let left = Math.round((ft - top_end_point.GPSTime) * ut), right = Math.round((pf.GPSTime - ft) * ut);
                obj._hash[top_key] && (obj._hash[top_key].Distance += left);
                dis = right;
            }
            dis = Math.round(dis + gpsUtil.GetLineDistance(ps));
        }
        // 暂时先放弃(设备提供的里程精度太低) 17-11-6
        // 优先使用设备里程。 17-11-7
        let __obj = {
            Distance: dis,
            PointCount: ps.length,
            GPSTime: key * 1,
            MileageBegin: pf.Mileage,
            MileageEnd: pe.Mileage,
            MaxSpeed: _maxSpeed.toFixed(3) + " km/h",
            Speed: (dis / (pe.GPSTime - pf.GPSTime)).toFixed(3)
        };
        myUtil.logger(JSON.stringify(__obj));
        let os = __obj.Speed * 3.6;
        if ((os < _maxSpeed * 1.5) || (_maxSpeed === 0 && os < 240)) {
            if (_maxSpeed < os) __obj.MaxSpeed = (os * 1.2).toFixed(3) + " km/h";
            __obj.Speed = (__obj.Speed * 3.6).toFixed(3) + " km/h";
            obj.add(key, __obj);
        }
        top_key = key;
        top_end_point = pe;
    }
    return obj;
};

let _do_save_mileage = function (data, sn, middleTime) {
    let push_obj = [];
    for (let k in data._hash) {
        if (!data._hash.hasOwnProperty(k)) continue;
        let obj = data._hash[k];
        obj.SerialNumber = sn;
        obj.MiddleTime = middleTime;
        obj.TimeString = new Date(k * 1000).FormatDate(4);
        if (obj.Distance > 0) push_obj.push(obj);
    }
    if (push_obj.length > 0) {
        myUtil.PostUrl(post_url, push_obj, function (url, data, status) {
            if (status !== 1) {
                myUtil.logger(`${post_url}, ${sn}, ${push_obj.length}, ${status} `)
            }
        }, "MileageSave");
    }
};

/***
 * 计算区间里程
 * @param data
 * @returns {*}
 * @private
 */
let _calcMiddleMileage = function (data) {
    if (data.length < 1) {
        return null;
    }
    let df = data.first(), de = data.last();
    let _start = _format_gt(df.GPSTime, calc_mid);
    let end = _format_gt(de.GPSTime, calc_mid) + calc_mid, i = 0;
    let obj = new myUtil.Hash();
    while (_start < end) {
        let dt = data[i].GPSTime, _m = _start * 1 + calc_mid;
        let key = _format_gt(dt, calc_mid);
        let das = [];
        if (dt < _m) {
            while (data[i].GPSTime < _m) {
                das.push(data[i]);
                i++;
                if (i === data.length) break;
            }
        }
        _start = _m;
        obj.add(key, das);
        if (i === data.length) break;
    }
    return obj;
};

let _readLeftList = function (key, sn, cb) {
    let now_time = Math.round(new Date().getTime() / 1000);
    let calc_time = _format_gt(now_time, calc_length);
    let calc_now_mid_time = now_time - calc_time;

    redis.LRANGE(key, 0, 1, function (err, lenArr) {
        let len = lenArr.length;
        // data && redis.RPUSH(key, data, function (err, result) {
        if (len < 2 || err) {
            err && console.log(err);
            // console.log(`${key} 未送到计算条件 第2个数据为空 ${len} 且数据已经过期`);
            if ((len * 1) === 1) {
                let obj = JSON.parse(lenArr[0]);
                let __mid = now_time - obj.GPSTime - calc_now_mid_time;
                // console.log(`${key} 未送到计算条件 第2个数据为空 ${len} 且数据已经过期 ${__mid}，则删除之: ${(__mid > calc_time)})`);
                if (__mid > calc_length) {
                    // console.log(`${key} 未送到计算条件 第2个数据为空 ${len} 且数据已经过期 ${__mid}，则删除之`);
                    redis.DEL(key);
                }
            }
            cb && cb();
            return;
        }

        // console.log(`${key} 可计算的长度为 ${len}`);
        // let now_time = Math.round(new Date().getTime() / 1000);
        // let calc_time = _format_gt(now_time, calc_length);
        // let calc_now_mid_time = now_time - calc_time;

        redis.LRANGE(key, 0, len, function (err, jsonArr) {
            try {
                let dataArray = [];
                for (let i = 0; i < jsonArr.length; i++) {
                    let _obj = JSON.parse(jsonArr[i]);
                    dataArray.push(_obj);
                }
                // if (data) dataArray = dataArray.concat(data);
                // console.log(`${key} 总的长度为 ${dataArray.length}`);

                /**以下为测试内容**/
                    // let test = [];
                let gn = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    // test.push(dataArray[i].GPSTime);
                    // 不能出现 "时间排序出错" 如果出现，则表示有些地方出了问题
                    if (gn > dataArray[i].GPSTime) console.log(key + " : 按时间排序出错 i = " + i + " LEN : " + len);
                    gn = dataArray[i].GPSTime;
                }
                // console.log(key + " : " + JSON.stringify(test));
                /**测试结果表示读取是按时间顺序进行读取的**/
                /**测试内容结束**/
                let arr = [];
                for (let i = 0; i < dataArray.length; i++) {
                    let _obj = dataArray[i];
                    if (_obj.GPSTime <= calc_time) arr.push(_obj);
                }

                if (arr.length > 1) {
                    // console.log(`${key} 移除了 ${arr.length} 条数据，总长度: ${len} 还有 ${len - arr.length + 1}`);
                    redis.LTRIM(key, arr.length - 1, -1);

                    if (dataArray.length === arr.length) {
                        // 如果最后一条和现在相近，则不删除，如果较久，则删除
                        let mid = now_time - dataArray.last().GPSTime;
                        let calc_mid = mid - calc_now_mid_time;
                        // 如果这个相隔两个计算周期，则此键可以删除
                        if (calc_mid > calc_length) {
                            console.log(`${key} TIME ERROR : 与当前相隔 ${mid.toPadLeft(6)} : 最大相隔 ${calc_now_mid_time} : 相差 ${calc_mid} 删除之`)
                            redis.DEL(key);
                        }
                    }

                    // 将针对arr进行数据处理
                    let hash = _calc_pack_mileage(_calcMiddleMileage(arr));
                    _do_save_mileage(hash, sn, calc_mid);
                }
                cb && cb(null, '1');
            } catch (e) {
                redis.DEL(key);
            }
        });
    });
    // redis.LRANGE(key, 0, 1, function (err, jsons) {
    //     // 默认计时两倍 calc_length 时长，这样可以保证不会有太多的积累数据
    //     // redis.EXPIRE(key, calc_length * 2);
    //
    //     // 只有两条以上符合要求才开始计算里程
    //     try {
    //         if (jsons.length < 2) {
    //             cb && cb();
    //             return;
    //         }
    //
    //         // 从左边读取一条，以判断其时间与当前时间是否相差超过calc_length(两小时)
    //         let calc_time = _format_gt(Math.round(new Date().getTime() / 1000), calc_length);
    //
    //         for (let i = 0; i < 2; i++) {
    //             let obj = JSON.parse(jsons[i]);
    //             if (obj.GPSTime > calc_time) {
    //                 cb && cb();
    //                 return;
    //             }
    //         }
    //
    //         // 开始读取整个区域的里程值，并传送到计算函数中。
    //         redis.LRANGE(key, 0, -1, function (err, jsonArr) {
    //             try {
    //                 /**以下为测试内容**/
    //                 let test = [];
    //                 for (let i = 0; i < jsonArr.length; i++) {
    //                     let _obj = JSON.parse(jsonArr[i]);
    //                     test.push(_obj.GPSTime);
    //                 }
    //                 console.log(JSON.stringify(test));
    //                 /**测试结果表示读取是按时间顺序进行读取的**/
    //                 /**测试内容结束**/
    //                 let arr = [];
    //                 for (let i = 0; i < jsonArr.length; i++) {
    //                     let _obj = JSON.parse(jsonArr[i]);
    //                     if (_obj.GPSTime <= calc_time) arr.push(_obj);
    //                     else {
    //                         redis.LTRIM(key, i - 1, -1);
    //                         break;
    //                     }
    //                     if (i === jsonArr.length - 1) {
    //                         // 如果最后一条和现在相近，则不删除，如果较久，则删除
    //                         let mid = Math.round(new Date().getTime() / 1000);
    //                         console.log(key + " :  _obj.GPSTime - mid = " + (_obj.GPSTime - mid));
    //                         redis.LTRIM(key, i - 1, -1);
    //                     }
    //                 }
    //
    //                 // 将针对arr进行数据处理
    //                 let hash = _calc_pack_mileage(_calcMiddleMileage(arr));
    //                 _do_save_mileage(hash, sn, calc_mid);
    //                 cb && cb(null, '1');
    //             } catch (e) {
    //                 redis.DEL(key);
    //             }
    //         });
    //     } catch (e) {
    //         redis.DEL(key);
    //     }
    //     cb && cb();
    // });
};

/***
 * localmileage demo
 * SerialNumber
 * GPSTime
 * Lat
 * Lng
 * Mileage
 * @param req
 * @param res
 * @param next
 */
let doLocationPost = function (req, res, next) {
    let data = req.body;
    let arr = [data];
    let sn = data.SerialNumber;
    if (util.isArray(data) && data.length > 0) {
        sn = data[0].SerialNumber;
        arr = data;
    }
    if (!!sn) {
        let key = redisMileageList.concat(sn);
        // 以下代码中存在一个时间先后的问题
        // let _arr = [];
        // for (let i = 0; i < arr.length; i++) {
        //     _arr.push(JSON.stringify(arr[i]));
        // }

        redis.LRANGE(key, 0, -1, function (err, result) {
            // 对数据进行排序
            let objs = result.parseJSON();
            objs = objs.concat(arr).sort((a, b) => a.GPSTime > b.GPSTime ? 1 : -1);
            redis.ZADD(redisMileageSortedSet, new Date().getTime(), sn);
            redis.del(key);
            // 右进
            redis.RPUSH(key, objs.stringifyJSON(), function (err, result) {
                // 左出
                _readLeftList(key, sn);
            });
        });

    }
    res.status(200).send("1");
};

let doSingle = function (req, res, next) {
    let sn = req.params.sn;
    let key = redisMileageList.concat(sn);
    // console.log(`读取 ${key} 的相关里程信息 并进行计算`);
    _readLeftList(key, sn);
    res.status(200).send("1");
};

let _doKeep = function (keys, i, max) {
    let index = i++;
    max = max || keys.length;
    if (index === keys.length || index >= max)return;
    let key = keys[index];
    redisMileageListPatten.test(key);
    let sn = RegExp.$1;
    _readLeftList(key, sn, function (err, end) {
        _doKeep(keys, i, max);
    });
};

let doClear = function (req, res, next) {
    redis.KEYS("list-run-mileage-*", function (err, keys) {
        _doKeep(keys, 0);
    });
};

/* GET users listing. */
router.get('/', demo);
router.post('/', doLocationPost);
router.get('/clear', doClear);
router.get('/single/:sn', doSingle);
router.post('/single/:sn', doSingle);

module.exports = router;
