grpc - google remote procedure call

You need to install 2 tools for gRPC communication -> purpose is generate gRPC specific codde
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest -> define what data is getting exchanged
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest -> define how the services communicate using gRPC

You also needs to install the protoc compiler
winget install protobuf



allow one microservices to call a function in another microservice over the network
uses http/2 for communication 
it uses protobuf - protocol buffers to exchange data (compact binary format)

in REST you have : 
http://localhost/services/1
responses will look like : 
{"id": 1, ...}


in gRPC you have let's say : 
checkServiceExist(service_id)
response with True / False

proto file define the communication contract : 
- it tells which remote functions are available
- it also tells what input / output each function is going to expect
- proto file does not have the main business / database logic

so in our case :
- when a client send a post booking request to our booking service, it first calls catalog service to run checkServiceExist() before inserting booking to bookings database
- so booking service is our gRPC client and catalog service is our gRPC server

Command to generate the code from .proto 
protoc \
  --go_out=. \
  --go_opt=paths=source_relative \
  --go-grpc_out=. \
  --go-grpc_opt=paths=source_relative \
  proto/catalog.proto


  .proto file mental model :
  .proto file

|
|-- message
|      |
|      +--> defines data structure (like Go struct)
|
|-- service
|      |
|      +--> defines remote functions (like Go interface)
|
|-- rpc
|      |
|      +--> defines one callable function
|
|-- option go_package
       |
       +--> tells protoc how to generate Go files


for services the compiler create something like this  :
type CatalogServiceServer interface {
    CheckServiceExists(
        context.Context,
        *CheckServiceRequest,
    ) (*CheckServiceResponse, error)

    mustEmbedUnimplementedCatalogServiceServer()
}