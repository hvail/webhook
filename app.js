var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var log4js = require('log4js');
var fs = require('fs');

var index = require('./routes/index');
var users = require('./routes/users');
var fence = require('./routes/fence');
var power = require('./routes/power');
var mileage = require('./routes/mileage');
var alarm_push_phone = require('./routes/push-alarm-phone');
var webhooks = require('./routes/webhooks');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

log4js.configure({
    appenders: {cheese: {type: 'file', filename: 'cheese.log'}},
    categories: {default: {appenders: ['cheese'], level: 'info'}},
    replaceConsole: true
});

var logger = log4js.getLogger('normal');
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
app.use('/webhooks', webhooks);
app.use('/mileage', mileage);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
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
