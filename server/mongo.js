const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

class Database {
    constructor(){
        this.client = {};
        this.database = {};
        this.initialized = false;
    }

    static initialize(){
        console.log("DB initializing")
        let obj = new Database();
        return new Promise(function(resolve){
            fs.readFile("./config.json", function(err,data){
                console.log("Config read!")
                assert.strictEqual(err,null);
                const configuration = JSON.parse(data);
                const url = 'mongodb://' + configuration.databaseLocation;
                const client = new MongoClient(url, { useNewUrlParser: true });
                console.log("Connecting!")
                client.connect(function(err){
                    assert.strictEqual(err,null);
                    console.log("Connected!")
                    obj.client = client;
                    obj.database = obj.client.db(configuration.databaseName);
                    obj.initialized = true;
                    resolve(obj);
                });
            });
        });
    }

    findOne(collectionName, key, value){
        if(!this.initialized){
            console.error("This database instance has not been initialized!!");
            return;
        }
        let obj = this;
        return new Promise(function(resolve){
            obj.database.collection(collectionName).findOne({[key]: value}, function(err, result){
                assert.strictEqual(err,null);
                if(result == null) result = {};
                resolve(result);
            });
        });
    }

    updateOne(collection, key, value, updateKey, updateValue){
        obj.database.collection(collection).updateOne({[key]: value}, {$set: {[updateKey]: updateValue}})
    }
}

module.exports = Database;