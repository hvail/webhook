const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const log4js = require('log4js');
const fs = require('fs');

// 正常处理
const event = require('./routes/event');
const position = require('./routes/position');

const index = require('./routes/index');
const users = require('./routes/users');
const fence = require('./routes/position');
const power = require('./routes/power');
const mileage = require('./routes/mileage');
const network = require('./routes/network');
const webhooks = require('./routes/webhooks');
const webtimer = require('./routes/webtimers');

let app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

log4js.configure({
    appenders: {
        cheese: {
            type: 'dateFile',
            filename: '/usr/log/webhook/logger',
            pattern: '-yyMMdd.log',
            alwaysIncludePattern: true
        }
    },
    categories: {default: {appenders: ['cheese'], level: 'info'}},
    replaceConsole: true
});

let logger = log4js.getLogger('normal');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/**独立性，唯一性接口**/
// 转发接口
app.use('/webhooks', webhooks);
// 轨迹点过围栏
app.use('/webhooks/location', fence);
// 电量数据过电量处理
app.use('/webhooks/power', power);

// 报警数据的触发
app.use('/event', event);
// 轨迹数据的触发
app.use('/position', position);
// 联网数据
app.use('/webhooks/network', network);

// ++++++++++++++++++  以上接口可以取代RabbitMq的部分功能  ++++++++++++++++++++++++++++++ //
// ++++++++++++++++++  以上接口可以由接收端直接数据输入     ++++++++++++++++++++++++++++++ //

app.use('/', index);
app.use('/users', users);
app.use('/fence', fence);
app.use('/power', power);
app.use('/webhook', webhooks);
app.use('/webtimer', webtimer);
app.use('/mileage', mileage);
app.use('/network', network);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    console.log(err);
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
