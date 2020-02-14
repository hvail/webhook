/**
 * Created by hvail on 2018/9/12.
 */
let mq = require('hvail-rabbitmq');
let mqClient = mq.MqCustom;
const redis = require('./../my_modules/redishelp');
const {util: apiUtil} = require('api-base-hvail');
const exPattern = /^Mileage_Timer_(\d{1,16})$/;
const _env = process.env || {};
const host = _env.MQ_RABBIT_HOST || "localhost", name = _env.MQ_RABBIT_NAME || "user",
    pwd = _env.MQ_RABBIT_PASSWORD || "pwd";

let listenMsg = (msg, type) => {
    let arr = JSON.parse(msg.content.toString());
    apiUtil.PromisePost('http://core.mileage.sky1088.com/mileage', arr)
        .then(msg => {
            if (msg !== 1)
                console.log(`http://core.mileage.sky1088.com/mileage :: ${msg}`);
        });
};

let listenMq = (custom) => {
    custom.listen("hyz.fanout.position", "run.mileage", msg => listenMsg(msg, "position"));
    console.log("队列服务连接成功");
};

let MQ = new mqClient(host, name, pwd, listenMq);

redis.on('pmessage', (pattern, channel, message) => {
    let gs = message.match(exPattern);
    if (gs) {
        let url = 'http://core.mileage.sky1088.com/mileage/clear';
        apiUtil.PromisePost(url, {SerialNumber: gs[1]})
            .then(m => console.log(`${gs[1]}:${url}=${m}`))
            .catch(e => {
                console.log(url);
                console.log(e)
            });
    } else {
        console.log(`非法过期： ${message}`);
    }
});

redis.psubscribe('__key*__:expired');

console.log("程序启动完成");
