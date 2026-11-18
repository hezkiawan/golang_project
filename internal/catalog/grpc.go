package catalog

import (
	"context"

	catalogpb "golang-microservice-practice/proto"

	"github.com/jackc/pgx/v5/pgxpool"
)

// THIS IS GRPC SERVER IMPLEMENTATION
type CatalogServer struct {
	// this is an empty unimplemented CatalogServiceServer from the gRPC so that you can implement the desired methods as you like / no need to implement all because UnimplementedCatalogServiceServer already  provides default "not implemented" methods
	catalogpb.UnimplementedCatalogServiceServer

	pool *pgxpool.Pool
}

func NewCatalogServer(pool *pgxpool.Pool) *CatalogServer {
	return &CatalogServer{
		pool: pool,
	}
}

// implement or more like override the method CheckServiceExists
// this method is to check whether or not service exist in catalog
func (s *CatalogServer) CheckServiceExists(ctx context.Context, req *catalogpb.CheckServiceRequest) (*catalogpb.CheckServiceResponse, error) {

	var exists bool

	// check if service id from req exist in db, returns a bool that's then moved to exists
	err := s.pool.QueryRow(
		ctx,
		"SELECT EXISTS (SELECT 1 FROM services WHERE id = $1)",
		req.GetServiceId(),
	).Scan(&exists)

	if err != nil {
		return nil, err
	}

	return &catalogpb.CheckServiceResponse{Exists: exists}, nil
}
