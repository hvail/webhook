const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const log4js = require('log4js');
const fs = require('fs');

const index = require('./routes/index');
const users = require('./routes/users');
const fence = require('./routes/fence');
const power = require('./routes/power');
const mileage = require('./routes/mileage');
const location = require('./routes/location');
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

app.use('/', index);
app.use('/mileage', mileage);

/****************  轨迹点的处理 ******************/
app.use('/location', location);
app.use('/location', mileage);
app.use('/location', fence);
// 正常处理
app.use('/location', (req, res) => res.send('1'));
// 异常处理
app.use('/location', (err, req, res) => {
    res.send('-1');
});

/****************  轨迹点的处理 ******************/
app.use('/power', power);
// 正常处理
app.use('/power', (req, res) => res.send('1'));
// 异常处理
app.use('/power', (err, req, res) => {
    res.send('-1');
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    console.log(err);
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
