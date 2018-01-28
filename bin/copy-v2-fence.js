/**
 * Created by hvail on 2017/9/26.
 */
const request = require('./../my_modules/request');
let area = process.env.DATAAREA || "en-us";
let util = require('util');
let myUtil = require('./../my_modules/utils');

let getBindFenceUrl = util.format("http://v2.local-api.%s.sky1088.com/GeoFence/GetFencesByTime/0", area);
let getFencesUrl = util.format("http://v2.local-api.%s.sky1088.com/GeoFence/GetFences", area);
let postBindFenceUrl = util.format("http://v3.res-mongo.server.%s.sky1088.com/fence", area);
let postFenceUrl = util.format("http://v3.manager-mongo.server.%s.sky1088.com/custom/fence", area);

/***
 * 围栏绑定数据模型
 */
let __FENCE_BIND_MODEL = {
    Name: "",
    Type: 0,
    Points: [],
    BindFenceId: 1000,
    SerialNumber: "0000000000000000",
    IsEnter: 1,
    IsLeave: 1
};

let __FENCE_MODEL = {
    Id: 10979,
    Points: [],
    UId: 109267,
    Type: 1,
    Purview: 1,
    Name: "报警"
};

let doPostFence = function (data, i) {
    if (i >= data.length) {
        console.log("Fence 转移完成");
        return;
    }
    let ii = i || 0;
    let _tmp = data[ii];
    let _pps = _tmp.Points.split("_");
    let _data = myUtil.Clone(__FENCE_MODEL, _tmp);
    _data.Name = _tmp.FenceName;
    _data.UId = _tmp.BuildAccount;
    _data.Points = [
        {
            Lat: _pps[0].split(",")[0] * 1,
            Lng: _pps[0].split(",")[1] * 1
        }, {
            Lat: _pps[1].split(",")[0] * 1,
            Lng: _pps[1].split(",")[1] * 1
        }];
    _data.Coord = "WGS84";
    console.log(postFenceUrl);
    console.log(_data);
    ii++;
    request.Post(postFenceUrl, _data, function (err, _result) {
        console.log(_result);
        doPostFence(data, ii);
    });
};

let doPostNewUrl = function (data, i) {
    if (i >= data.length) {
        console.log("Binds 转移完成");
        return;
    }
    let ii = i || 0;
    let _tmp = data[ii];
    let _pps = _tmp.Points.split("_");
    let _data = myUtil.Clone(__FENCE_BIND_MODEL, _tmp);
    _data.Name = _tmp.FenceName;
    _data.Points = [{
        Lat: _pps[0].split(",")[0] * 1,
        Lng: _pps[0].split(",")[1] * 1
    }, {
        Lat: _pps[1].split(",")[0] * 1,
        Lng: _pps[1].split(",")[1] * 1
    }];
    _data.Coord = "WGS84";
    ii++;
    request.Post(postBindFenceUrl, _data, function (err, _result) {
        doPostNewUrl(data, ii);
    });
};

let doFences = function () {
    console.log(getFencesUrl);
    request.Post(getFencesUrl, {}, function (err, result) {
        let data = JSON.parse(result);
        doPostFence(data);
    });
};


let doBindFences = function () {
    request.Post(getBindFenceUrl, {}, function (err, result) {
        let data = JSON.parse(result);
        doPostNewUrl(data);
    });
};

doFences();
setTimeout(doBindFences, 450000);
