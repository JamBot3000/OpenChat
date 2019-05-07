const http = require('http');
const https = require('https');
const fs = require('fs');

module.exports = function(noProxy,httpsOptions){
    return new Promise(function(resolve){
        if(!noProxy){
            let webServer = https.createServer(httpsOptions, function(req,res){
                res.writeHead(401);
                res.end();
            });
            webServer.listen(6502, function() {
                console.log((new Date()) + " Server is listening on port 6502");
            });
            resolve(webServer);
        } else {
            webServer = http.createServer(function(req,res){
                res.writeHead(401);
                res.end();
            });
            webServer.listen(6502, function() {
                console.log((new Date()) + " Server is listening on port 6502");
            });
            resolve(webServer);
        }
    });
}