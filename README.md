# 在线实时处理系统
***
#### 在此处的所有数据都是实时计算的，不再作离线处理。

![image](https://img.alicdn.com/imgextra/i4/3083182657/TB2_5v7BbxmpuFjSZJiXXXauVXa_!!3083182657.jpg_430x430q90.jpg)

### v1.0 

***

#### 访问接口

    - post /webhooks (向推送添加一个 router)
     {
          "TargetUrl": "http://101.132.32.190:8081/rest/seal/addSealEvent",
          "TargetDevice": "0000000000000000",
          "Listener": "GPSEvent"
     }
    
    2 - get /webhooks/lis/{listener}/{targetDevice} (按监听类型和监听目标来查询)
    
    
    
### END
    
    