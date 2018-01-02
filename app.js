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
const alarm_push_phone = require('./routes/push-alarm-phone');
const webhooks = require('./routes/webhooks');

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
// logger.setLevel('DEBUG')
// uncomment after placing your favicon in /public
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
// app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);
app.use('/fence', fence);
app.use('/power', power);
app.use('/push-alarm-phone', alarm_push_phone);
app.use('/webhook', webhooks);
app.use('/webhooks', webhooks);
app.use('/mileage', mileage);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    let err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
