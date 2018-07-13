/***
 * 车辆里程计算(只限于车辆行驶)
 * Created by hvail on 2018/7/1.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const api = "http://v3.res.server.zh-cn.sky1088.com/track/range/";
const baiduSk = "inl7EljWEdaPIiDKoTHM3Z7QGMOsGTDT";
const baiduApiUrl = "http://api.map.baidu.com/direction/v2/driving";
const drivingApi = (origin, dest, ps, alt) => {
    let url = `${baiduApiUrl}?origin=${origin.Lat_Bd},${origin.Lng_Bd}&alternatives=1&destination=${dest.Lat_Bd},${dest.Lng_Bd}&ak=${baiduSk}`;
    if (ps && ps.length) url += '&waypoints=' + getWayPointsString(ps);
    console.log(url);
    return url;
};

const getWayPoint = (point) => {
    return `${point.Lat_Bd},${point.Lng_Bd}`;
};

const getWayPointsString = (ps) => {
    let m = [];
    for (let i = 0; i < ps.length; i++) {
        m.push(getWayPoint(ps[i]));
    }
    return m.join('|');
};

// 设备号
let sn = "1010331804190007";
// 读取的日期
let time = "2018-06-21";
// 时区(测试时区为0)
let timezone = 0;

// 停止计算时间
const middleStopTime = 1800;

let opt = {
    sn: sn,
    start: new Date(time).getTime() / 1000 - timezone * 3600,
    end: new Date(time).getTime() / 1000 - timezone * 3600 + 86400
};

// 分段计算(初级版只按时间计算)
const partCalc = (ds) => {
    let parts = [];
    let curr_part = [];
    let previous = null;
    for (let i = 0; i < ds.length; i++) {
        let de = ds[i];
        if (previous) {
            curr_part.push(previous);
            if ((de.GPSTime - previous.GPSTime) > middleStopTime) {
                // 跟据里程和停泊时间进行计算这次分段是否合适
                // let distance = gpsUtil.GetDistance(de.Lat, de.Lng, previous.Lat, previous.Lng);
                parts.push(curr_part);
                curr_part = [];
            }
        }
        previous = de;
    }
    parts.push(curr_part);
    return parts;
};

const partMileageMatch = (ps) => {
    return partMileageRun(ps[0]);
    // return partMileageRun(ps[0].slice(0, 20));
};

const _pullTrackPoint = (ps) => {
    // 提取途经点 比例最高为1分钟一个点，大于1分钟则两点相连
    let arr = [];
    let pro = null;
    let _add = (p) => {
        pro = p;
        arr.push(p);
    };
    for (let i = 0; i < ps.length; i++) {
        let curr = ps[i];
        if (!pro || (curr.GPSTime - pro.GPSTime > 60)) _add(curr);
    }
    return arr;
};

// 每段的里程核对
const partMileageRun = (_ps) => {
    let ps = [];
    for (let i = 0; i < _ps.length; i++) if (_ps[i].UpMode === 1) ps.push(_ps[i]);
    // let way = _pullTrackPoint(ps);
    let first = ps.first(), end = ps.last();
    // let wayString = getWayPointsString(way);
    // console.log(wayString);
    let url = drivingApi(first, end, [], 1);
    return myUtil.HttpGetPromise(url)
        .then((res) => res.result.routes)
        .then((routes) => {
            let Run_Dis = gpsUtil.GetLineDistance(ps);
            for (let i = 0; i < routes.length; i++) {
                let route = routes[i];
                let Rou_Dis = route.distance;
                console.log(`${Run_Dis}:${Rou_Dis} ==> ${Rou_Dis - Run_Dis}`);
            }
            return routes.length;
        });
};

// myUtil.HttpGetPromise(`${api}${sn}/${opt.start}/${opt.end}`)
//     .then(partCalc)
//     .then(partMileageMatch)
//     .then(console.log)
//     .catch(console.log);

