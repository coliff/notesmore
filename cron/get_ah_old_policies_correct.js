const axios = require('axios'); 
const jwtDecode = require('jwt-decode');
let login_post = function (){
  
    //return new Promise(function(resolve, reject){
        return   axios.post("http://47.100.213.55:3000/_login",{"id":"ah-old-system-endorse","password":"Rein0OaV"})
        // .then(function (response) {
        //     resolve(response);
        //     //console.log(response);
        //   });
  //});
}

let policies_post = function (toket,id,postData){
  
    //return new Promise(function(resolve, reject){
        return axios({
            method: 'post',
            url: 'http://47.100.213.55:3000/starr-cn/ah-old/'+id+'/_patch',
            headers: {'authorization': 'Bearer '+global.token},
            data:postData
        })
        .then(function (response) {
            return response;
            //resolve(response);
            //console.log(response);
          })
        .catch(console.error); 
  //});
}
let get_policies = function (toket,startId,limit){
    //return new Promise(function(resolve, reject){
        return axios.get("http://dicc.ins24.com/ah/esCorrect?limit="+limit+"&startId="+startId)
        .then(function (response) {
            if(response.data.length){
                for (let i = 0;i<response.data.length;i++){
                    policies_post(toket,response.data[i].targetId,response.data[i]);
                }
            }
            if(response.data.length){
                if(response.data.length < limit){
                    setTimeout(() => {
                        login(response.data[response.data.length-1].id,limit);
                        //get_policies(toket,response.data[response.data.length-1].id,limit);
                    }, 60000);
                }else{
                    setTimeout(() => {
                        login(response.data[response.data.length-1].id,limit);
                        //get_policies(toket,response.data[response.data.length-1].id,limit);
                    }, global.sleepTime);
                }
                
            }else{
                setTimeout(() => {
                    login(startId,limit);
                    //get_policies(toket,response.data[response.data.length-1].id,limit);
                }, 60000);
                
            }
            //resolve(response);
          });
  //});
}

global.token='';
global.sleepTime=5000;
let login = async function(startId,limit){
    let currentHour= new Date().getHours();
    if(currentHour > 6){
        limit=50;
        global.sleepTime=15000;
    }else{
        global.sleepTime=10000;
    }
    if(!global.token){
        let body = await login_post();
        global.token=body.data;
    }else{
        let decodedToken = jwtDecode(global.token), time = new Date().getTime()/1000;
        if(((time - decodedToken.iat) > (decodedToken.exp-decodedToken.iat)*2/3)) {
            let bodyData = await login_post();
            global.token=bodyData.data;
        }
    }
    get_policies(global.token,startId,limit);
}
login(0,100);