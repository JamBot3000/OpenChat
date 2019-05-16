# OpenChat
## THIS IS NOT FINISHED!!
OpenChat is a chat platform, designed to support multiple different chatrooms as well as sharding users across multiple servers instances

## Dependencies
- RabbitMQ
- NodeJS
- MongoDB

## How it works
Each client finds a server instance to connect to. It then communicates all messages to that server, and receives all messages from other users back. Each message a server receives is transmitted by RabbitMQ to all the other server instances, which then communicate the data to all their clients.

## Contributors
- Me
