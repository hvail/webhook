/**
 * Created by hvail on 2017/9/6.
 */
var GPSUtils = {};

/**
 * 地球半径
 */
var EARTHRADIUS = 6370996.81;

/**
 * 将源对象的所有属性拷贝到目标对象中
 * @name baidu.extend
 * @function
 * @grammar baidu.extend(target, source)
 * @param {Object} target 目标对象
 * @param {Object} source 源对象
 * @returns {Object} 目标对象
 */
GPSUtils.extend = function (target, source) {
    for (var p in source) {
        if (source.hasOwnProperty(p)) {
            target[p] = source[p];
        }
    }
    return target;
};

GPSUtils.ClassCopy = function (mode, target) {
    for (var p in mode) {
        if (source.hasOwnProperty(p)) {
            target[p] = target[p] || mode[p];
        }
    }
    return target;
}

/**
 * 将v值限定在a,b之间，纬度使用
 */
function _getRange(v, a, b) {
    if (a != null) {
        v = Math.max(v, a);
    }
    if (b != null) {
        v = Math.min(v, b);
    }
    return v;
}

/**
 * 将v值限定在a,b之间，经度使用
 */
function _getLoop(v, a, b) {
    while (v > b) {
        v -= b - a
    }
    while (v < a) {
        v += b - a
    }
    return v;
}

/**
 * 将度转化为弧度
 * @param {degree} Number 度
 * @returns {Number} 弧度
 */
GPSUtils.degreeToRad = function (degree) {
    return Math.PI * degree / 180;
}

GPSUtils.equalPoint = function (p1, p2) {
    if ((p1.Lat * 100000 - p2.Lat * 100000) < 1 && (p1.Lng * 100000 - p2.Lng * 100000) < 1) {
        return true;
    }
    return false;
}

/***
 * 将多边形或线形计算出最大矩形
 * @param pPolygon
 * @returns {arr} [sw,ne]
 */
GPSUtils.getPolygonBound = function (pPolygon) {
    var sw, ne;
    if (pPolygon.length < 3) return [];
    var fPoint = pPolygon[0];

    // 最低值
    var west = fPoint.Lng, south = fPoint.Lat;
    // 最高值
    var east = fPoint.Lng, north = fPoint.Lat;

    for (var i = 1; i < pPolygon.length; i++) {
        var _p = pPolygon[i];
        if (_p.Lng < west) west = _p.Lng;
        if (_p.Lng > east) east = _p.Lng;
        if (_p.Lat < south) south = _p.Lat;
        if (_p.Lat > north) north = _p.Lat;
    }

    return [{Lng: west, Lat: south}, {Lng: east, Lat: north}];
}

/**
 * 计算两点之间的距离,两点坐标必须为经纬度
 * @param {point1} Point 点对象
 * @param {point2} Point 点对象
 * @returns {Number} 两点之间距离，单位为米
 */
GPSUtils.GetDistance = function (Lat1, Lng1, Lat2, Lng2) {
    //判断类型
    Lng1 = _getLoop(Lng1, -180, 180);
    Lat1 = _getRange(Lat1, -74, 74);
    Lng2 = _getLoop(Lng2, -180, 180);
    Lat2 = _getRange(Lat2, -74, 74);

    var x1, x2, y1, y2;
    x1 = GPSUtils.degreeToRad(Lng1);
    y1 = GPSUtils.degreeToRad(Lat1);
    x2 = GPSUtils.degreeToRad(Lng2);
    y2 = GPSUtils.degreeToRad(Lat2);

    return Math.round(EARTHRADIUS * Math.acos((Math.sin(y1) * Math.sin(y2) + Math.cos(y1) * Math.cos(y2) * Math.cos(x2 - x1))));
}

/**
 * 计算折线或者点数组的长度
 * @param {Polyline|Array<Point>} polyline 折线对象或者点数组
 * @returns {Number} 折线或点数组对应的长度
 */
GPSUtils.GetLineDistance = function (points) {
    // console.log(points.length);
    //检查类型
    if (points instanceof Array) {
        if (points.length < 2) {
            //小于2个点，返回0
            return 0;
        }
        //遍历所有线段将其相加，计算整条线段的长度
        var totalDis = 0;
        for (var i = 0; i < points.length - 1; i++) {
            var curPt = points[i];
            var nextPt = points[i + 1]
            var dis = GPSUtils.GetDistance(curPt.Lat, curPt.Lng, nextPt.Lat, nextPt.Lng) || 0;
            totalDis += dis * 1;
        }
        return totalDis;
    } else {
        return 0;
    }
}

/***
 * 判断点是否在圆形内
 */
GPSUtils.IsPointInCircle = function (Fps, lat, lng) {
    //point与圆心距离小于圆形半径，则点在圆内，否则在圆外
    var pCircle = Fps[0];
    var r = GPSUtils.GetDistance(pCircle.Lat, pCircle.Lng, Fps[1].Lat, Fps[1].Lng);

    var dis = GPSUtils.GetDistance(pCircle.Lat, pCircle.Lng, lat, lng);
    return (dis <= r);
}

/***
 * 判断点是否在矩形内
 */
GPSUtils.IsPointInRect = function (Fps, lat, lng) {
    var sw = Fps[0];
    var ne = Fps[1];
    return (lng >= sw.Lng && lng <= ne.Lng && lat >= sw.Lat && lat <= ne.Lat);
}

/***
 * 判断点是否多边形内
 */
GPSUtils.IsPointInPolygon = function (Fps, lat, lng) {
    var pPoint = {Lat: lat, Lng: lng};
    //首先判断点是否在多边形的外包矩形内，如果在，则进一步判断，否则返回false
    var polygonBounds = this.getPolygonBound(Fps);
    if (!this.IsPointInRect(pPoint, polygonBounds)) {
        return false;
    }

    var pts = Fps;//获取多边形点

    //下述代码来源：http://paulbourke.net/geometry/insidepoly/，进行了部分修改
    //基本思想是利用射线法，计算射线与多边形各边的交点，如果是偶数，则点在多边形外，否则
    //在多边形内。还会考虑一些特殊情况，如点在多边形顶点上，点在多边形边上等特殊情况。

    var N = pts.length;
    var boundOrVertex = true; //如果点位于多边形的顶点或边上，也算做点在多边形内，直接返回true
    var intersectCount = 0;//cross points count of x
    var precision = 2e-10; //浮点类型计算时候与0比较时候的容差
    var p1, p2;//neighbour bound vertices
    var p = pPoint; //测试点

    p1 = pts[0];//left vertex
    for (var i = 1; i <= N; ++i) {
        //check all rays
        if (this.equalPoint(p, p1)) {
            return boundOrVertex;
            //p is an vertex
        }

        p2 = pts[i % N];//right vertex
        if (p.Lat < Math.min(p1.Lat, p2.Lat) || p.Lat > Math.max(p1.Lat, p2.Lat)) {//ray is outside of our interests
            p1 = p2;
            continue;//next ray left point
        }

        if (p.Lat > Math.min(p1.Lat, p2.Lat) && p.Lat < Math.max(p1.Lat, p2.Lat)) {//ray is crossing over by the algorithm (common part of)
            if (p.Lng <= Math.max(p1.Lng, p2.Lng)) {//x is before of ray
                if (p1.Lat == p2.Lat && p.Lng >= Math.min(p1.Lng, p2.Lng)) {//overlies on a horizontal ray
                    return boundOrVertex;
                }

                if (p1.Lng == p2.Lng) {
                    //ray is vertical
                    if (p1.Lng == p.Lng) {
                        //overlies on a vertical ray
                        return boundOrVertex;
                    } else {//before ray
                        ++intersectCount;
                    }
                } else {//cross point on the left side
                    var xinters = (p.Lat - p1.Lat) * (p2.Lng - p1.Lng) / (p2.Lat - p1.Lat) + p1.Lng;//cross point of Lng
                    if (Math.abs(p.Lng - xinters) < precision) {//overlies on a ray
                        return boundOrVertex;
                    }

                    if (p.Lng < xinters) {//before ray
                        ++intersectCount;
                    }
                }
            }
        } else {//special case when ray is crossing through the vertex
            if (p.Lat == p2.Lat && p.Lng <= p2.Lng) {//p crossing over p2
                var p3 = pts[(i + 1) % N]; //next vertex
                if (p.Lat >= Math.min(p1.Lat, p3.Lat) && p.Lat <= Math.max(p1.Lat, p3.Lat)) {//p.Lat lies between p1.Lat & p3.Lat
                    ++intersectCount;
                } else {
                    intersectCount += 2;
                }
            }
        }
        p1 = p2;//next ray left point
    }

    if (intersectCount % 2 == 0) {
        //偶数在多边形外
        return false;
    } else {
        //奇数在多边形内
        return true;
    }
}


module.exports = GPSUtils;