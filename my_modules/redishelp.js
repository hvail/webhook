// const redis_host = "119.23.27.9";
// const redis_pwd = "892df215f8684736:HvailCom2015";
const redis_host = process.env.REDIS_HOST || "10.0.253.5";
const redis_pwd = process.env.REDIS_PASSWORD || "hyz_2018";
const redis_port = process.env.REDIS_PORT || 6379;
// const redis_port = 6380;
const redis = require('redis');
const util = require('util');
let redisClient;
let isConnection = false;

redisClient = redis.createClient(redis_port, redis_host, {});
redisClient.auth(redis_pwd);
redisClient.on('ready', () => redisClient.on('connect', () => isConnection = true));

const build = (host, port, auth) => {
    redisClient = redis.createClient(host, port, {});
    redisClient.auth(auth);
    redisClient.on('ready', () => redisClient.on('connect', () => isConnection = true));
    return redisClient;
};

redisClient.execPromise = function (cmd) {
    let args = Array.from(arguments).slice(1, arguments.length);
    let cb = null;
    if (typeof args[args.length - 1] === 'function') {
        cb = args[args.length - 1];
        args = args.slice(0, args.length - 1);
    }
    return new Promise(function (resolve, reject) {
        let fn = function (err, result) {
            // 回调函数和Promise可同时使用
            if (cb) cb(err, result);
            err ? reject(err) : resolve(result);
        };
        if (args.length === 1) redisClient[cmd](args[0], fn);
        else if (args.length === 2) redisClient[cmd](args[0], args[1], fn);
        else if (args.length === 3) redisClient[cmd](args[0], args[1], args[2], fn);
        else redisClient[cmd](args, fn);
    });
};

const reg = new RegExp('},{', "g");

redisClient.ArrayToObject = (arr) => {
    let result = [];
    if (!arr) return [];
    for (let i = 0; i < arr.length; i++) {
        try {
            let jsr = arr[i].replace(reg, "}|-|{");
            let jss = jsr.split("|-|");
            for (let j = 0; j < jss.length; j++) {
                let obj = JSON.parse(jss[j]);
                result.push(obj);
            }
        } catch (e) {
            console.log(arr[i]);
            console.log(e);
        }
    }
    return result;
};

redisClient.build = build;
module.exports = redisClient;

