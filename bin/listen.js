/**
 * Created by hvail on 2018/9/12.
 */
let mq = require('hvail-rabbitmq');
let mqClient = mq.MqCustom;

const {util: apiUtil} = require('api-base-hvail');

let listenMsg = (msg, type) => {
    let arr = JSON.parse(msg.content.toString());
    apiUtil.PromisePost('http://119.23.27.9:3100/mileage', arr)
        .then(msg => console.log('http://119.23.27.9:3100/mileage :: ' + msg));
};

let listenMq = (custom) => {
    custom.listen("hyz.fanout.position", "run.mileage", msg => listenMsg(msg, "position"));
};


let MQ = new mqClient("119.23.27.9", "hvail", "hvail", listenMq);