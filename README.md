# 客户级别推送

### v1.0 

***

#### 访问接口

    1 - post /webhooks (向推送添加一个 router)
    > {
    >      "TargetUrl": "http://101.132.32.190:8081/rest/seal/addSealEvent",
    >      "TargetDevice": "0000000000000000",
    >      "Listener": "GPSEvent"
    > }
    
    2 - get /webhooks/lis/{listener}/{targetDevice} (按监听类型和监听目标来查询)
    
    
    
### END
    
    