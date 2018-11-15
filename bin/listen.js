/**
 * Created by hvail on 2018/9/12.
 */
let mq = require('hvail-rabbitmq');
let mqClient = mq.MqCustom;
const redis = require('./../my_modules/redishelp');
const {util: apiUtil} = require('api-base-hvail');
const exPattern = /^Mileage_Timer_(\d{1,16})$/;
console.log("Mileage_Timer_0028231712090269".match(exPattern));
const _env = process.env || {};
const host = _env.MQ_RABBIT_HOST || "119.23.27.9", name = _env.MQ_RABBIT_NAME || "hvail",
    pwd = _env.MQ_RABBIT_PASSWORD || "hvail";

let listenMsg = (msg, type) => {
    let arr = JSON.parse(msg.content.toString());
    apiUtil.PromisePost('http://core.mileage.sky1088.com/mileage', arr);
    // .then(msg => console.log('http://core.mileage.sky1088.com/mileage :: ' + msg))
};

let listenMq = (custom) => {
    custom.listen("hyz.fanout.position", "run.mileage", msg => listenMsg(msg, "position"));
};

let MQ = new mqClient(host, name, pwd, listenMq);

redis.on('pmessage', (pattern, channel, message) => {
    console.log(message);
    let gs = message.match(exPattern);
    if (gs) {
        apiUtil.PromisePost('http://core.mileage.sky1088.com/mileage/clear', {SerialNumber: gs[1]});
    }
});

redis.psubscribe('__key*__:expired');

console.log("程序启动完成");