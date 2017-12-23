const redis_host = process.env.REDIS_HOST || "112.74.57.39";
const redis_pwd = process.env.REDIS_PASSWORD || "892df215f8684736:HvailCom2015";
const redis_port = process.env.REDIS_PORT || 6379;
// const redis_port = 6380;
const redis = require('redis');
let redisClient;
let isConnection = false;

// console.log(redis_host);
// console.log(redis_pwd);
// console.log(redis_port);

redisClient = redis.createClient(redis_port, redis_host, {});
redisClient.auth(redis_pwd);
redisClient.on('ready', function (res) {
    redisClient.on('connect', function () {
        isConnection = true;
    });
});

module.exports = redisClient;

