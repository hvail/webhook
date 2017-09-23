var redis_host = process.env.REDIS_HOST || "112.74.51.81";
var redis_pwd = process.env.REDIS_PASSWORD || "HvailCom2015HYZ";
var redis_port = process.env.REDIS_PORT || 6379;
// var redis_port = 6380;
var redis = require('redis');
var redisClient;
var isConnection = false;

console.log(redis_host);
console.log(redis_pwd);
console.log(redis_port);

redisClient = redis.createClient(redis_port, redis_host, {});
redisClient.auth(redis_pwd);
redisClient.on('ready', function (res) {
    // console.log('Redis 加载完成');
    redisClient.on('connect', function () {
        isConnection = true;
    });
});

module.exports = redisClient;