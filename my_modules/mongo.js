// "use strict"

const mongo = require('mongodb');
const client = mongo.MongoClient;

const _env = process.env;
const dbName = _env.Mongo_DBName || 'Resource';
const limit = 3000;
let mongoUrl = 'mongodb://hvail:hyz_2018@10.0.253.3:27017';
let run_db;

let connect = function (cb, ecb) {
    if (!run_db)
        client.connect(mongoUrl, function (err, mongo) {
            if (err) {
                ecb && ecb(err);
                return;
            }
            // console.log(mongoUrl);
            run_db = mongo;
            // mongo = mongo.db(dbName);
            cb && cb(mongo);
        });
    else
        cb && cb(run_db);
};

let insertExistsColIndex = function (db, colName, field, indexName, indexObj) {
    let col = db.collection(colName);
    col.indexExists(indexName, function (obj) {
        if (obj === null)
            col.createIndex(field, indexObj);
    });
};

let insert = function (db, colName, data, cb, ecb) {
    let col = db.collection(colName);
    let _cb = function (err, result) {
        if (err) {
            ecb && ecb(err);
            return;
        }
        cb && cb(result);
    };
    !Array.isArray(data) ? col.insertOne(data, _cb) : col.insertMany(data, {ordered: false}, _cb);
};

let update = function (db, colName, filter, data, cb) {
    let col = db.collection(colName);
    // col.updateOne(filter, data, cb);
    col.update(filter, data, {upsert: true}, cb);
};

let query = function (db, opt, filter, cb) {
    let col = db.collection(opt.colName);
    let _cb = function (err, result) {
        if (err)
            cb && cb(err);
        else
            cb && cb(null, result);
    };
    let _limit = opt.limit || limit;
    if (opt.sort)
        col.find(filter).sort(opt.sort).limit(_limit).toArray(_cb);
    else
        col.find(filter).limit(_limit).toArray(_cb);
};

let count = function (db, colName, filter, cb, ecb) {
    let col = db.collection(colName);
    let _cb = function (err, result) {
        if (err) {
            ecb && ecb(err);
            return;
        }
        cb && cb(result);
    };
    col.find(filter).count(_cb);
};

let remove = function (db, colName, filter, cb) {
    let col = db.collection(colName);
    let _cb = function (err, result) {
        if (err) {
            cb && cb(err);
            return;
        }
        cb && cb(null, result);
    };
    col.remove(filter, _cb);
};

let cloneOption = function (opt) {
    let _opt = {};
    if (typeof opt === 'string') {
        _opt.colName = opt;
        _opt.dbName = dbName;
    } else
        _opt = opt;
    return _opt;
};

let MongoDbManager = {};

MongoDbManager.add = function (obj, opt, cb) {
    connect(function (db) {
        let _opt = cloneOption(opt);
        _opt.dbName = _opt.dbName || dbName;
        db = db.db(_opt.dbName);
        let colName = _opt.colName;
        if (_opt.index)
            insertExistsColIndex(db, colName, _opt.index, _opt.indexName, {
                unique: _opt.indexUnique,
                name: _opt.indexName
            });
        insert(db, colName, obj, function (data) {
            cb && cb(null, data);
            // console.log(data);
            // db.close();
        }, cb);
    }, cb);
};

MongoDbManager.set = function (filter, obj, opt, cb) {
    connect(function (mongo) {
        let _opt = cloneOption(opt);
        mongo = mongo.db(_opt.dbName || dbName);
        update(mongo, _opt.colName, filter, obj, function (err, data) {
            cb && cb(err, data);
        });
    }, cb);
};

MongoDbManager.find = function (filter, opt, cb) {
    connect(function (mongo) {
        try {
            let _opt = cloneOption(opt);
            mongo = mongo.db(_opt.dbName || dbName);
            if (opt.sort) _opt.sort = opt.sort;
            query(mongo, _opt, filter, function (err, data) {
                cb && cb(err, data);
            });
        } catch (e) {
            console.log("MongoDbManager.find");
            console.log(filter);
            console.log(opt);
            console.log(e);
            console.log(mongo.db);
            cb && cb(e);
        }
    }, function (err) {
        console.log(err);
        cb && cb(err);
    });
};

MongoDbManager.getCount = function (filter, opt, cb, eb) {
    connect(function (db) {
        let _opt = cloneOption(opt);
        db = db.db(_opt.dbName || dbName);
        count(db, _opt.colName, filter, function (_count) {
            cb && cb(_count);
        }, function (err) {
            console.log(err);
            eb && eb(0);
        });
    });
};

MongoDbManager.del = function (filter, opt, cb) {
    connect(function (db) {
        let _opt = cloneOption(opt);
        db = db.db(_opt.dbName || dbName);
        remove(db, _opt.colName, filter, function (err, resutl) {
            cb && cb(err, resutl);
        }, cb);
    });
};

MongoDbManager.ObjectID = mongo.ObjectID;

//=================================================================
// 主项目Id级查询
let _getByMasterId = MongoDbManager["GetByMasterId"] = function (val) {
    let filter = {};
    filter["_id"] = new mongo.ObjectID(val);
    return filter;
};

// 主项目级查询
let _getByMaster = MongoDbManager["GetByMaster"] = function (fieldName, val) {
    let filter = {};
    filter[fieldName] = val;
    return filter;
};

// 主项目级批量查询
let _getByMasters = MongoDbManager["GetByMasters"] = function (fieldName, vals) {
    let filter = {};
    filter[fieldName] = {};
    filter[fieldName]["$in"] = vals;
    return filter;
};

// 子项目级查询
let _getByChild = MongoDbManager["GetByChild"] = function (idField, key, childField, fieldName, val) {
    let filter = {};
    if (!!key) filter[idField] = key;
    filter[childField + "." + fieldName] = val;
    return filter;
};
module.exports = MongoDbManager;
