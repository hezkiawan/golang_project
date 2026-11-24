package catalog

type Service struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ServiceRequest struct {
	Name string `json:"name"`
}

// error body returned by the handlers (only used so swag can show its shape)
type ErrorResponse struct {
	Error string `json:"error"`
}
