package catalog

type Service struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ServiceRequest struct {
	Name string `json:"name"`
}
