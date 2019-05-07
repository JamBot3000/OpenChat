const serverCreator = require('./webcreator');
const WebSocket = require('ws');
const fs = require('fs');
const NRP = require('node-redis-pubsub');
const sha256 = require('js-sha256').sha256;

/*
    There's the possibility that someone would like to run this with only one shard, without a loadbalancer.
    Whilst this is unadvisable, the following variables allow you to specify your HTTPS certificates.
    When behind a load balancer, the certificates should be on the load balancer, and the proxy request sent here.

    If you want to run this without HTTPS without a load balancer (YOU REALLY SHOULDN'T IN PRODUCTION!) then ignore this.
    Then, specify the location of the load balancer for the client as just the location of this instance.
*/

const noProxy = true;
const httpOptions = {
    key: fs.readFileSync("./config.json"),
    cert: fs.readFileSync("./config.json")
};
const redisEnabled = false;

/*
    End here!
*/

let nrp;

if(redisEnabled){
    const redisPub = redis.createClient();
    const redisSub = redis.createClient();
    
    const redisConfig = {
        emitter: redisPub,
        receiver: redisSub,
    }
    
    nrp = new NRP(redisConfig);
}
let dbHandler = require('./mongo');

let connections = {};
let usernames = {};

const systemUser = {
    userid: -1,
    username: "System",
    avatar: "",
    usergroups: ["steward","bureaucrat"]
}

serverCreator(noProxy,httpOptions).then(function(webServer){
    const wsServer = new WebSocket.Server({server: webServer });

    function makeid(length) {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < length; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));

        return text;
    }

    const serverID = makeid(5);

    dbHandler.initialize().then(function(db){
        console.log("Database initialized!!")
        function sendMessageToClients(user, message, room){
            console.log(`[${room}] <${user.username}> ${message}`)
            const obj = JSON.stringify({
                type: "message",
                user: user,
                message: message
            })
            Object.keys(connections).forEach(element => {
                let connection = connections[element];
                if(connection.room === room){
                    connection.connection.send(obj);
                }
            });
        }

        function postNewMessage(userObj, message, room){
            if(redisEnabled){
                nrp.emit('message', {room: room, message: message, user: data, server: serverID});
            }
            sendMessageToClients(userObj,message,room);
        }

        function sendMessage(usernameTo, userFrom, message, notOriginatingServer){
            const msgObj = {
                type: "message",
                user: userFrom,
                message: "[PRIVATE] " + message
            }
            Object.keys(connections).forEach(connectionID => {
                const connection = connections[connectionID];
                if(connection.username === usernameTo){
                    connection.connection.send(JSON.stringify(msgObj))
                }  
            });
            if(redisEnabled && !notOriginatingServer){
                nrp.emit('private_message', {message: message, usernameTo: usernameTo, from: userFrom})
            }
        }

        if(redisEnabled){
            nrp.on("message",function(data){
                if(data.server !== serverID){
                    sendMessageToClients(data.user,data.message,data.rooom);
                }
            });

            nrp.on("private_message",function(data){
                sendMessage(data.usernameTo, data.from, data.message,true);
            });
        }

        console.log("Creating request handler - serverID is " + serverID);
        wsServer.on('connection', function(connect,req) {
            let authToken = "GUEST";
            let username = `guest_${makeid(5)}`;
            const connectionID = makeid(15);

            const originalMessage = {
                type: "send_info",
                connection_id: connectionID,
                username: username,
                serverinstance: serverID
            };

            connections[originalMessage.connection_id] = {
                connection: connect,
                username: username,
                room: "mainchat"
            }
            
            connect.send(JSON.stringify(originalMessage));
            postNewMessage(systemUser,username + " has joined the room.", "mainchat")

            connect.on('message', function(msg){
                console.log("MESSAGE RECEIVED - Connection ID" + connectionID);
                /*if(msg.type !== "utf8"){
                    return;
                }*/
                const json = JSON.parse(msg);

                switch(json.type){
                    case "setroom":
                        db.findOne("rooms","name",json.room).then(function(data){
                            if(data === {} || data === null){
                                return;
                            }
                            connections[connectionID].room = json.room;
                            connection.send(JSON.stringify({
                                type: "setroom",
                                roomdata: data
                            }))
                        });
                        break;
                    case "authenticate":
                        db.findOne("users","username",json.username).then(function(data){
                            if(data === {} || data == null){
                                sendMessage(username,systemUser,"Invalid username or password!",false);
                            } else {
                                const salt = data.salt;
                                const saltedPass = sha256(json.password + salt)
                                if(saltedPass !== data.password){
                                    sendMessage(username,systemUser,"Invalid username or password!",false);
                                    return;
                                } else {
                                    postNewMessage(systemUser,username + " has identified as" + data.username,connections[connectionID].room);
                                    username = data.username;
                                    authToken = makeid(10);
                                    db.updateOne("users","username",username,"token",authToken);
                                }
                            }
                        });
                        break;
                    case "authenticateToken":
                        db.findOne("users","token",json.token).then(function(data){
                            if(data === {} || data === null){
                                sendMessage(connections[connectionID].username,systemUser,"Invalid token!");
                                return;
                            } else {
                                console.log(data)
                                postNewMessage(systemUser,username + " has identified as " + data.username,connections[connectionID].room);
                                username = data.username;
                            }
                        });
                        break;
                    case "message":
                        if(authToken !== "GUEST"){
                            db.findOne("users","token",authToken).then(function(data){
                                if(data === {} || data === null){
                                    connection.send(JSON.stringify({
                                        type: "close",
                                        reason: "Suspicious credentials"
                                    }));
                                    connection.close();
                                    return;
                                } else if(data.banned){
                                    connection.send(JSON.stringify({
                                        type: "close",
                                        reason: "Account is closed."
                                    }));
                                    connection.close();
                                    return;
                                } else {
                                    const publicObj = {
                                        username: data.username,
                                        avatar: data.avatar,
                                        groups: data.usergroups
                                    };
                                    postNewMessage(publicObj,json.message, connections[connectionID].room);
                                }
                            });
                            break;
                        } else {
                            const userObj = {
                                username: username,
                                avatar: "https://i.imgur.com/oEBKa3F.png",
                                usergroups: ["member"],
                                guest: true
                            }
                            postNewMessage(userObj,json.message, connections[connectionID].room);
                        }
                        break;
                }
            });
        });
        console.log("Request handler is done OwO")
    });
});