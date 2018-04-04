// const redis_host = "119.23.27.9";
// const redis_pwd = "892df215f8684736:HvailCom2015";
const redis_host = process.env.REDIS_HOST || "119.23.27.9";
const redis_pwd = process.env.REDIS_PASSWORD || "892df215f8684736:HvailCom2015";
const redis_port = process.env.REDIS_PORT || 6379;
// const redis_port = 6380;
const redis = require('redis');
let redisClient;
let isConnection = false;

redisClient = redis.createClient(redis_port, redis_host, {});
redisClient.auth(redis_pwd);
redisClient.on('ready', () => redisClient.on('connect', () => isConnection = true));

redisClient.execPromise = function (cmd) {
    let args = Array.from(arguments).slice(1, arguments.length);
    let cb = null;
    if (typeof args[args.length - 1] === 'function') {
        cb = args[args.length - 1];
        args = args.slice(0, args.length - 1);
    }
    return new Promise(function (resolve, reject) {
        redisClient[cmd](args, function (err, result) {
            // 回调函数和Promise可同时使用
            if (cb) cb(err, result);
            if (!err) {
                resolve(result);
            } else {
                console.log(err);
                reject(err);
            }
        });
    });
};

module.exports = redisClient;

